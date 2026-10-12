// The next brew booked into each tank, read from the Brewery Schedule Google
// Calendar. That calendar is the one schedule the brewery keeps, so the empty
// tank cards read it rather than a second list inside the app.

import { listEvents, adelaideNow, dayKey, addDaysKey } from './google'
import type { NextScheduledBrew } from '@/types'

const LOOK_AHEAD_DAYS = 120
const CACHE_MS = 5 * 60 * 1000

let cache: { at: number; byTank: Record<string, NextScheduledBrew> } | null = null

/** "BREW FV8 - Party Shirt" -> ["FV8", "Party Shirt"]. Brews with no tank yet are skipped. */
function parseBrew(title: string): [string, string] | null {
  const m = /^\s*BREW\s+(FV\s*\d+|BBT\s*[AB])\s*[-–:]\s*(.+)$/i.exec(title)
  if (!m) return null
  const raw = m[1].toUpperCase().replace(/\s+/g, '')
  const tank = raw.startsWith('BBT') ? `BBT ${raw.slice(3)}` : raw
  return [tank, m[2].trim()]
}

/** Keyed by tank name as the app spells it ("FV8", "BBT A"). Empty if the calendar cannot be read. */
export async function nextBrewsByTank(): Promise<Record<string, NextScheduledBrew>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byTank
  try {
    const today = dayKey(adelaideNow())
    const events = await listEvents(today, addDaysKey(today, LOOK_AHEAD_DAYS))
    const byTank: Record<string, NextScheduledBrew> = {}
    for (const e of events) { // already in date order
      const parsed = parseBrew(e.title)
      if (!parsed || e.date < today) continue
      const [tank, beer] = parsed
      if (!byTank[tank]) byTank[tank] = { id: e.id, scheduled_date: e.date, recipe_name: beer, recipe: null }
    }
    cache = { at: Date.now(), byTank }
    return byTank
  } catch (err) {
    console.error('[next-brews] calendar read failed:', err instanceof Error ? err.message : err)
    return cache?.byTank ?? {}
  }
}
