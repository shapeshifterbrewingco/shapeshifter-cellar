// Writes an approved plan to the Brewery Schedule. Only reached when a person
// presses Apply on a plan card - the chat model has no way to call this.

import { NextResponse, type NextRequest } from 'next/server'
import { createEvent, updateEvent, deleteEvent, getEvent, adelaideNow, dayKey, addDaysKey } from '@/lib/planner/google'
import { staffEmail } from '@/lib/planner/session'
import type { Plan } from '@/lib/planner/tools'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const email = await staffEmail()
  if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { plan } = (await request.json()) as { plan: Plan }
  if (!plan?.changes?.length || plan.changes.length > 30) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const stamp = `Planner, ${email.split('@')[0]}, ${dayKey(adelaideNow())}`
  const results: { ok: boolean; message: string }[] = []

  for (const c of plan.changes) {
    try {
      if (c.action === 'create') {
        if (!c.date || !c.title) throw new Error('missing date or title')
        const ev = await createEvent({
          date: c.date, endDate: c.end_date, title: c.title,
          description: [c.description, `Added by ${stamp}. ${c.reason}`].filter(Boolean).join('\n'),
        })
        results.push({ ok: true, message: `Added ${ev.date} ${ev.title}` })
        continue
      }

      // Update/delete: refuse if someone changed the event after the plan was made
      const current = c.event_id ? await getEvent(c.event_id) : null
      if (!current) throw new Error('event no longer exists')
      if (c.before && (current.title !== c.before.title || current.date !== c.before.date)) {
        throw new Error(`changed since the plan was made (now ${current.date} ${current.title}) - not touched`)
      }

      if (c.action === 'delete') {
        await deleteEvent(current.id)
        results.push({ ok: true, message: `Deleted ${current.date} ${current.title}` })
      } else {
        // Moving a multi-day event keeps its length unless a new end date is given
        const span = (Date.parse(current.endDate) - Date.parse(current.date)) / 86400000
        const endDate = c.end_date ?? (c.date && span > 0 ? addDaysKey(c.date, span) : undefined)
        const ev = await updateEvent(current.id, {
          date: c.date, endDate, title: c.title,
          description: [c.description ?? current.description, `Changed by ${stamp}: ${c.reason}`].filter(Boolean).join('\n'),
        })
        results.push({ ok: true, message: `Updated to ${ev.date} ${ev.title} (was ${current.date} ${current.title})` })
      }
    } catch (e) {
      const label = c.title || c.before?.title || c.event_id || 'change'
      results.push({ ok: false, message: `${c.action} ${label}: ${(e as Error).message}` })
    }
  }

  return NextResponse.json({ results })
}
