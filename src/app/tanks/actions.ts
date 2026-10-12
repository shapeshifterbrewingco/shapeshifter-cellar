'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFrigidReadings, FRIGID_OFF_SET_POINT } from '@/lib/frigid'
import { logGroupedActivity, who } from '@/lib/slack'

// [lowest, highest] set point allowed, by Frigid vessel name
const LIMITS: Record<string, [number, number]> = {
  default: [-5, 40],  // fermenters and brites
  HLT: [0, 99],       // hot liquor
  CLT: [-2, 30],      // cold liquor
  Glycol: [-10, 20],  // chiller
}

export async function setTankTarget(tankId: string, targetTemp: number): Promise<{ success: boolean; message: string }> {
  if (!Number.isFinite(targetTemp)) return { success: false, message: 'Enter a temperature.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'You are signed out. Sign in again and retry.' }

  const { data: tank, error } = await supabase
    .from('tanks')
    .select('frigid_asset_id, name, frigid_tank_name')
    .eq('id', tankId)
    .single()

  if (error || !tank) return { success: false, message: 'Tank not found' }
  if (!tank.frigid_asset_id) return { success: false, message: `${tank.name} has no Frigid asset ID configured` }

  // This goes to a live controller, so a slip of the finger must not get
  // through. Each kind of vessel has its own sane range.
  const [min, max] = LIMITS[tank.frigid_tank_name ?? ''] ?? LIMITS.default
  if (targetTemp < min || targetTemp > max) {
    return { success: false, message: `${tank.name} can be set between ${min} and ${max}°C. Nothing was changed.` }
  }

  const apiKey = process.env.FRIGID_API_KEY
  const apiUrl = process.env.FRIGID_API_URL
  if (!apiKey || !apiUrl) return { success: false, message: 'Frigid API not configured' }

  // What it was before, for the activity log. Read before the change is sent.
  const before = (await getFrigidReadings()).find((r) => r.name === tank.frigid_tank_name)?.setPoint
  const previous = before != null && before !== FRIGID_OFF_SET_POINT ? before : null

  const body = { assetId: tank.frigid_asset_id, target: targetTemp, unitTemperature: 'C' }
  console.log('[setTankTarget] POST', `${apiUrl}/asset/target`, body)

  try {
    const res = await fetch(`${apiUrl}/asset/target`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    console.log('[setTankTarget] status:', res.status, 'body:', text)

    let json: { success?: boolean; message?: string } = {}
    try { json = JSON.parse(text) } catch { /* non-JSON response */ }

    if (!res.ok || !json.success) {
      return { success: false, message: json.message ?? `HTTP ${res.status}: ${text}` }
    }
  } catch (err) {
    console.error('[setTankTarget] fetch error:', err)
    return { success: false, message: err instanceof Error ? err.message : 'Network error' }
  }

  // Store the desired setpoint on the tank row itself so the frigid-poll cron
  // (which inserts new temperature_readings rows) can never overwrite it.
  const { error: saveError } = await supabase
    .from('tanks')
    .update({ desired_set_point_c: targetTemp })
    .eq('id', tankId)
  if (saveError) console.error('[setTankTarget] set point sent to Frigid but not saved:', saveError.message)

  const change = `${targetTemp}°C${previous != null ? ` (was ${previous}°C)` : ''}`
  logGroupedActivity(`${tankId}:${user.email ?? user.id}`, `${who(user.email)} set ${tank.name} to ${change}.`, `set it to ${change}`)

  revalidatePath('/')
  revalidatePath('/dashboard')
  return { success: true, message: `Setpoint updated to ${targetTemp}°C` }
}
