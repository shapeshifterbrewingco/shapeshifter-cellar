// Writes an approved plan to the Brewery Schedule. Only reached when a person
// presses Apply on a plan card - the chat model has no way to call this.
//
// The plan arrives from the browser, so nothing in it is trusted: every change
// is checked here, and an update or delete only goes ahead if the event still
// looks the way it did when the plan was drawn up.

import { NextResponse, type NextRequest } from 'next/server'
import { createEvent, updateEvent, deleteEvent, getEvent, listEvents, adelaideNow, dayKey, addDaysKey } from '@/lib/planner/google'
import { staffEmail } from '@/lib/planner/session'
import type { Plan, PlannedChange } from '@/lib/planner/tools'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function check(c: PlannedChange): string | null {
  if (!['create', 'update', 'delete'].includes(c.action)) return `unknown action "${String(c.action)}"`
  if (c.date !== undefined && !isDate(c.date)) return 'date is not a real YYYY-MM-DD date'
  if (c.end_date !== undefined && !isDate(c.end_date)) return 'end date is not a real YYYY-MM-DD date'
  if (c.date && c.end_date && c.end_date < c.date) return 'end date is before the start date'
  if (c.title !== undefined && (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 200)) return 'title is empty or too long'
  if (c.action === 'create') return c.date && c.title ? null : 'missing date or title'
  if (!c.event_id) return 'no event to change'
  // Without the "before" snapshot there is no way to tell the event is still
  // the one the plan was written against
  if (!c.before?.title || !isDate(c.before.date)) return 'plan is missing what the event looked like, so it cannot be checked'
  return null
}

export async function POST(request: NextRequest) {
  const email = await staffEmail()
  if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { plan?: Plan } | null
  const plan = body?.plan
  if (!plan || !Array.isArray(plan.changes) || !plan.changes.length || plan.changes.length > 30) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const stamp = `Planner, ${email.split('@')[0]}, ${dayKey(adelaideNow())}`
  const results: { ok: boolean; message: string }[] = []

  for (const c of plan.changes) {
    const label = c.title || c.before?.title || c.event_id || 'change'
    try {
      const problem = check(c)
      if (problem) throw new Error(problem)

      if (c.action === 'create') {
        // Pressing Apply twice (a dropped response, a second tab) must not put
        // the same brew on the calendar twice
        const sameDay = await listEvents(c.date!, c.date!)
        if (sameDay.some((e) => e.date === c.date && sameTitle(e.title, c.title!))) {
          results.push({ ok: true, message: `Already on the calendar: ${c.date} ${c.title}` })
          continue
        }
        const ev = await createEvent({
          date: c.date!, endDate: c.end_date, title: c.title!.trim(),
          description: [c.description, `Added by ${stamp}. ${c.reason ?? ''}`].filter(Boolean).join('\n'),
        })
        results.push({ ok: true, message: `Added ${ev.date} ${ev.title}` })
        continue
      }

      // Update/delete: refuse if someone changed the event after the plan was made
      const current = await getEvent(c.event_id!)
      if (!current) {
        // A delete that is already gone has done its job
        if (c.action === 'delete') { results.push({ ok: true, message: `Already deleted: ${c.before!.date} ${c.before!.title}` }); continue }
        throw new Error('event no longer exists')
      }
      if (current.title !== c.before!.title || current.date !== c.before!.date) {
        // An update that has already landed is not a conflict
        const alreadyDone = c.action === 'update'
          && (c.date === undefined || current.date === c.date)
          && (c.title === undefined || current.title === c.title)
        if (alreadyDone) { results.push({ ok: true, message: `Already updated: ${current.date} ${current.title}` }); continue }
        throw new Error(`changed since the plan was made (now ${current.date} ${current.title}) - not touched`)
      }

      if (c.action === 'delete') {
        await deleteEvent(current.id)
        results.push({ ok: true, message: `Deleted ${current.date} ${current.title}` })
      } else {
        // The planner only writes all-day events. Moving a timed one would turn
        // it into an all-day event and lose its time.
        if (!current.allDay && c.date && c.date !== current.date) {
          throw new Error(`has a set time (${current.time}), so move it in Google Calendar - not touched`)
        }
        // Moving a multi-day event keeps its length unless a new end date is given
        const span = (Date.parse(current.endDate) - Date.parse(current.date)) / 86400000
        const endDate = c.end_date ?? (c.date && span > 0 ? addDaysKey(c.date, span) : undefined)
        const ev = await updateEvent(current.id, {
          date: current.allDay ? c.date : undefined, endDate, title: c.title?.trim(),
          description: [c.description ?? current.description, `Changed by ${stamp}: ${c.reason ?? ''}`].filter(Boolean).join('\n'),
        })
        results.push({ ok: true, message: `Updated to ${ev.date} ${ev.title} (was ${current.date} ${current.title})` })
      }
    } catch (e) {
      results.push({ ok: false, message: `${c.action} ${label}: ${(e as Error).message}` })
    }
  }

  return NextResponse.json({ results })
}
