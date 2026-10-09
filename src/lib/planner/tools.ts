// Tools the planner chat can call. Everything here is read-only except that
// propose_calendar_changes records a plan. Plans are only ever written to the
// calendar by /api/planner/apply, when a person presses Apply.

import type Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { listEvents, getEvent, addDaysKey, dayKey } from './google'
import { allocate, type TankEvent } from './tanks'
import { stockForecast } from './forecast'

import { getPacks } from './sales-app/splits'

export type ChangeAction = 'create' | 'update' | 'delete'

export interface PlannedChange {
  action: ChangeAction
  event_id?: string
  date?: string
  end_date?: string
  title?: string
  description?: string
  reason: string
  before?: { date: string; endDate: string; title: string } | null
}

export interface Plan {
  id: string
  summary: string
  changes: PlannedChange[]
  created_at: string
}

const DATE = { type: 'string', description: 'YYYY-MM-DD' } as const

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_calendar',
    description:
      'Read the Brewery Schedule Google Calendar between two dates (inclusive). Returns every event with its id, date, end date and title: BREW / TRANSFER / PACK runs, annual leave (e.g. "Carla - AL", "ZAC AL"), deliveries, meetings. Call this before planning anything, and again before proposing changes - Carla edits the calendar during the day.',
    input_schema: {
      type: 'object',
      properties: { from: DATE, to: DATE },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_stock_forecast',
    description:
      'Stock on hand and run-out forecast for every active SKU, from the Sales App. "now" matches the Sales App Stock page exactly. Includes weekly draw rate, flat and seasonally adjusted run-out dates, the next pack (Packaging Splits sheet + calendar), the brew feeding it, estimated stock after that pack, and orders held for expected big customers.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_packaging_splits',
    description:
      "Pack runs from Carla's Packaging Splits sheet, from the start of last month to six months ahead: date, beer as written on the sheet, and quantity per format (16PK, 24PK, 20L, 30L, 50L). The sheet lags the calendar and future months may have no tab yet.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'allocate_tanks',
    description:
      'Run the cellar tank solver. It reads the real calendar (last 10 weeks to 6 months ahead), works out when each fermenter frees up, and assigns every brew with no tank ("BREW - <beer>") to a vessel that satisfies the cellar rules (large tanks, racking arms, brites). Pass proposed_events to test brews/transfers/packs you are thinking of adding, and manual_plan to check a tank choice. Never assign a tank by eye - always run this.',
    input_schema: {
      type: 'object',
      properties: {
        proposed_events: {
          type: 'array',
          description: 'Hypothetical events added for this run only, e.g. {"date":"2026-11-05","title":"BREW - Party Shirt CARTONS"} and its matching PACK. Use "BREW - <beer>" (no tank) to let the solver choose.',
          items: { type: 'object', properties: { date: DATE, title: { type: 'string' } }, required: ['date', 'title'] },
        },
        manual_plan: {
          type: 'object',
          description: 'Optional {"<beer as in the BREW title after the dash>": "FV4"} to validate a specific tank choice.',
          additionalProperties: { type: 'string' },
        },
      },
    },
  },
  {
    name: 'propose_calendar_changes',
    description:
      'Put a set of calendar changes in front of the user as a plan card with an Apply button. This does NOT change the calendar. Nothing is written until the user reads the plan and presses Apply themselves. Use it only after you have explained the plan in chat and the user has said to go ahead with it (e.g. "yes, book it in"). One call per plan; include every change in the plan.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One line describing the plan.' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['create', 'update', 'delete'] },
              event_id: { type: 'string', description: 'Required for update and delete. From get_calendar.' },
              date: { ...DATE, description: 'Start date. Required for create; for update only if moving it.' },
              end_date: { ...DATE, description: 'Last day, for multi-day events. Omit for single-day.' },
              title: { type: 'string', description: 'Use the schedule grammar: "BREW FV8 - Party Shirt CARTONS", "TRANSFER FV2 > BBT - Golden Ratio CARTONS", "PACK BBT - Nordic SPLIT".' },
              description: { type: 'string' },
              reason: { type: 'string', description: 'Why, in a few words.' },
            },
            required: ['action', 'reason'],
          },
        },
      },
      required: ['summary', 'changes'],
    },
  },
]

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

async function proposePlan(input: { summary: string; changes: PlannedChange[] }) {
  const problems: string[] = []
  const changes: PlannedChange[] = []
  if (!Array.isArray(input.changes) || !input.changes.length) problems.push('No changes given.')
  if ((input.changes || []).length > 30) problems.push('More than 30 changes - split it into smaller plans.')
  for (const [i, c] of (input.changes || []).slice(0, 30).entries()) {
    const n = `Change ${i + 1}`
    if (!['create', 'update', 'delete'].includes(c.action)) { problems.push(`${n}: unknown action`); continue }
    if (c.date !== undefined && !isDate(c.date)) problems.push(`${n}: date must be YYYY-MM-DD`)
    if (c.end_date !== undefined && !isDate(c.end_date)) problems.push(`${n}: end_date must be YYYY-MM-DD`)
    if (c.action === 'create' && (!c.date || !c.title)) problems.push(`${n}: create needs date and title`)
    let before: PlannedChange['before'] = null
    if (c.action !== 'create') {
      if (!c.event_id) { problems.push(`${n}: ${c.action} needs event_id`); continue }
      const ev = await getEvent(c.event_id)
      if (!ev) { problems.push(`${n}: event ${c.event_id} not found on the Brewery Schedule`); continue }
      before = { date: ev.date, endDate: ev.endDate, title: ev.title }
      if (c.action === 'update' && !c.date && !c.title && c.description === undefined) problems.push(`${n}: update changes nothing`)
    }
    changes.push({ ...c, before })
  }
  if (problems.length) return { result: { error: 'Plan not created. Fix these and call again.', problems } }
  const plan: Plan = { id: randomUUID().slice(0, 8), summary: input.summary, changes, created_at: new Date().toISOString() }
  return {
    plan,
    result: {
      plan_id: plan.id,
      status: 'SHOWN TO USER - NOT APPLIED. The calendar has not changed. The user must press Apply on the plan card. Do not say it is booked.',
      changes: changes.map((c) => ({ action: c.action, date: c.date, title: c.title, was: c.before?.title })),
    },
  }
}

/** Runs one tool. `plan` is set when a plan card should be shown. */
export async function runTool(name: string, input: Record<string, unknown>, today: Date): Promise<{ result: unknown; plan?: Plan }> {
  const todayKey = dayKey(today)
  switch (name) {
    case 'get_calendar': {
      const from = isDate(input.from) ? input.from : addDaysKey(todayKey, -14)
      const to = isDate(input.to) ? input.to : addDaysKey(todayKey, 120)
      const events = await listEvents(from, to)
      return {
        result: events.map((e) => ({
          id: e.id, date: e.date, ...(e.endDate !== e.date ? { end: e.endDate } : {}),
          ...(e.time ? { time: e.time } : {}), title: e.title,
          ...(e.description ? { note: e.description.slice(0, 200) } : {}),
        })),
      }
    }
    case 'get_stock_forecast':
      return { result: await stockForecast(today) }
    case 'get_packaging_splits': {
      const packs = (await getPacks(today)) as unknown as { date: Date; beer: string; qty: Record<string, number> }[]
      return { result: packs.map((p) => ({ date: dayKey(p.date), beer: p.beer, qty: p.qty })) }
    }
    case 'allocate_tanks': {
      const events = await listEvents(addDaysKey(todayKey, -70), addDaysKey(todayKey, 183))
      const tankEvents: TankEvent[] = events
        .filter((e) => /^\s*(BREW|TRANSFER|PACK)\b/i.test(e.title) && !/^\s*PACK PREP/i.test(e.title))
        .map((e) => [e.date, e.title.trim()])
      const proposed = (input.proposed_events as { date: string; title: string }[] | undefined) || []
      for (const p of proposed) if (isDate(p.date) && p.title) tankEvents.push([p.date, p.title.trim()])
      return { result: allocate(tankEvents, input.manual_plan as Record<string, string> | undefined) }
    }
    case 'propose_calendar_changes':
      return proposePlan(input as unknown as { summary: string; changes: PlannedChange[] })
    default:
      return { result: { error: `Unknown tool ${name}` } }
  }
}
