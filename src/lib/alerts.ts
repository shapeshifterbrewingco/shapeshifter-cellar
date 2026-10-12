// Temperature alarms. Run by the poller every ten minutes.
//
// An alarm posts to Slack once when it has lasted long enough to be real, and
// once more when it clears. alert_state remembers which are live in between, so
// a tank that sits off its set point all night is one message, not fifty.

import { createServiceClient } from '@/lib/supabase/server'
import { FRIGID_OFF_SET_POINT } from '@/lib/frigid'
import type { FrigidReading } from '@/lib/frigid'
import { postSlack, slackConfigured, cellarLink, esc } from '@/lib/slack'

// ── The rules. Change the numbers here. ─────────────────────────────────────

/** A tank this far from its set point, and not heading towards it, is a problem */
const TANK_OFF_BY_C = 3
/** ...once it has been that way this long */
const HOLD_MINUTES = 30
/** "Heading towards it" means it moved at least this much in the last half hour */
const MOVING_C = 0.3
/** A tank on chill that has warmed this much in half an hour */
const CHILL_WARMING_C = 1
/** How far each utility vessel may sit from its set point */
const UTILITY_OFF_BY_C: Record<string, number> = { HLT: 15, CLT: 5, Glycol: 5 }
/**
 * Vessels whose alarm is switched off. The glycol probe is out of its well and
 * reading room air while the temporary chiller setup is in place (Oct 2026), so
 * its number means nothing. Take 'Glycol' out of this list once the probe is back.
 */
const MUTED = new Set<string>(['Glycol'])
const UTILITY_NAMES: Record<string, string> = { HLT: 'Hot liquor', CLT: 'Cold liquor', Glycol: 'Glycol chiller' }
/** Frigid silent for this long */
const FRIGID_DOWN_MINUTES = 15

interface Condition { key: string; message: string; holdMinutes: number }

const t = (n: number) => `${n.toFixed(1)}°C`

export async function runAlerts(readings: FrigidReading[]): Promise<{ raised: number; cleared: number; live: number } | { skipped: string }> {
  if (!slackConfigured()) return { skipped: 'Slack is not connected' }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: 'No service key' }
  const db = createServiceClient()
  const now = Date.now()
  const conditions: Condition[] = []

  if (readings.length === 0) {
    conditions.push({
      key: 'frigid:down',
      holdMinutes: FRIGID_DOWN_MINUTES,
      message: 'Frigid is not responding. The app cannot see tank temperatures or send set points. Check the Frigid panel directly.',
    })
  } else {
    const since = new Date(now - 50 * 60 * 1000).toISOString()
    const [{ data: tanks }, { data: brews }, { data: history }] = await Promise.all([
      db.from('tanks').select('id, name, frigid_tank_name, is_utility').not('frigid_tank_name', 'is', null),
      db.from('brews').select('tank_id, beer_name, stage').is('deleted_at', null).not('stage', 'in', '(empty,transferred,packaged)'),
      db.from('temperature_readings').select('tank_id, temperature_c, recorded_at').gte('recorded_at', since).order('recorded_at', { ascending: true }),
    ])

    // Where each tank was about half an hour ago, to tell "cooling down" from "stuck"
    const earlier = new Map<string, number>()
    for (const h of (history ?? []) as { tank_id: string; temperature_c: number; recorded_at: string }[]) {
      const ageMin = (now - new Date(h.recorded_at).getTime()) / 60000
      if (ageMin >= 20 && !earlier.has(h.tank_id)) earlier.set(h.tank_id, Number(h.temperature_c))
    }
    const brewByTank = new Map(((brews ?? []) as { tank_id: string; beer_name: string; stage: string }[]).map((b) => [b.tank_id, b]))
    const live = new Map(readings.map((r) => [r.name, r]))

    for (const tank of (tanks ?? []) as { id: string; name: string; frigid_tank_name: string; is_utility: boolean }[]) {
      const r = live.get(tank.frigid_tank_name)
      if (!r || r.temperature == null) continue
      const temp = r.temperature
      const set = r.setPoint != null && r.setPoint !== FRIGID_OFF_SET_POINT ? r.setPoint : null
      if (set == null) continue
      const gap = temp - set
      const before = earlier.get(tank.id)
      const change = before != null ? temp - before : null

      if (MUTED.has(tank.frigid_tank_name)) continue

      if (tank.is_utility) {
        const allowed = UTILITY_OFF_BY_C[tank.frigid_tank_name] ?? 5
        if (Math.abs(gap) >= allowed) {
          const label = UTILITY_NAMES[tank.frigid_tank_name] ?? tank.name
          conditions.push({
            key: `off:${tank.id}`,
            holdMinutes: HOLD_MINUTES,
            message: `${label} is at ${t(temp)}, ${Math.abs(gap).toFixed(1)}° ${gap > 0 ? 'above' : 'below'} its ${t(set)} set point.`,
          })
        }
        continue
      }

      const brew = brewByTank.get(tank.id)
      if (!brew) continue // an empty tank drifting is not an emergency
      const beer = esc(brew.beer_name)

      if (brew.stage === 'on_chill' && change != null && change >= CHILL_WARMING_C && gap > 1) {
        conditions.push({
          key: `warming:${tank.id}`,
          holdMinutes: 0,
          message: `${tank.name} (${beer}) is on chill but warming: ${t(temp)}, up ${change.toFixed(1)}° in the last half hour. Set point is ${t(set)}.`,
        })
        continue
      }

      if (Math.abs(gap) >= TANK_OFF_BY_C) {
        // Still on its way there (chilling down, or free-rising) is normal
        const closing = change != null && (gap > 0 ? change <= -MOVING_C : change >= MOVING_C)
        if (!closing) {
          conditions.push({
            key: `off:${tank.id}`,
            holdMinutes: HOLD_MINUTES,
            message: `${tank.name} (${beer}) is at ${t(temp)}, ${Math.abs(gap).toFixed(1)}° ${gap > 0 ? 'above' : 'below'} its ${t(set)} set point, and not moving towards it.`,
          })
        }
      }
    }
  }

  const { data: rows, error } = await db.from('alert_state').select('key, first_seen_at, notified_at, message')
  if (error) return { skipped: error.message }
  const existing = new Map(((rows ?? []) as { key: string; first_seen_at: string; notified_at: string | null; message: string }[]).map((r) => [r.key, r]))

  // The first time Slack is reachable, say so, so there is proof the channel is wired up
  if (!existing.has('meta:connected')) {
    const sent = await postSlack(`*Cellar is connected to this channel.* Temperature alarms and the activity log will post here. ${cellarLink()}`)
    if (sent) await db.from('alert_state').insert({ key: 'meta:connected', message: 'connected', notified_at: new Date().toISOString() })
  }
  const current = new Map(conditions.map((c) => [c.key, c]))
  let raised = 0, cleared = 0

  for (const c of conditions) {
    const row = existing.get(c.key)
    const firstSeen = row ? new Date(row.first_seen_at).getTime() : now
    const due = (now - firstSeen) / 60000 >= c.holdMinutes
    if (!row) {
      const sent = due ? await postSlack(`*Alarm:* ${c.message} ${cellarLink()}`) : false
      await db.from('alert_state').insert({ key: c.key, message: c.message, notified_at: sent ? new Date().toISOString() : null })
      if (sent) raised++
    } else if (!row.notified_at && due) {
      const sent = await postSlack(`*Alarm:* ${c.message} ${cellarLink()}`)
      if (sent) {
        await db.from('alert_state').update({ notified_at: new Date().toISOString(), message: c.message }).eq('key', c.key)
        raised++
      }
    }
  }

  for (const [key, row] of existing) {
    if (current.has(key) || key.startsWith('meta:')) continue
    // With Frigid silent nothing about the tanks is known, so a tank alarm is
    // neither confirmed nor cleared. It stays live until there is a reading.
    if (readings.length === 0 && key !== 'frigid:down') continue
    if (row.notified_at) {
      const mins = Math.round((now - new Date(row.first_seen_at).getTime()) / 60000)
      const lasted = mins >= 90 ? `${(mins / 60).toFixed(1)} hours` : `${mins} minutes`
      await postSlack(`*Cleared:* ${row.message.replace(/ is at .*/, ' is back in range.').replace(/ is on chill but warming.*/, ' has stopped warming.').replace(/^Frigid is not responding.*/, 'Frigid is responding again.')} It lasted ${lasted}.`)
      cleared++
    }
    await db.from('alert_state').delete().eq('key', key)
  }

  return { raised, cleared, live: conditions.length }
}
