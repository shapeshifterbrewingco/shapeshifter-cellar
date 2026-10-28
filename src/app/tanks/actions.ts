'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFrigidReadings } from '@/lib/frigid'
import { coolingOff } from '@/lib/cooling'

// [lowest, highest] set point allowed, by Frigid vessel name
const LIMITS: Record<string, [number, number]> = {
  default: [-5, 40],  // fermenters and brites
  HLT: [0, 99],       // hot liquor
  CLT: [-2, 30],      // cold liquor
  Glycol: [-10, 20],  // chiller
}

/** Set points are not posted to Slack: the brewers change them all day and nobody needs to hear about it. */
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

  revalidatePath('/')
  revalidatePath('/dashboard')
  return { success: true, message: `Setpoint updated to ${targetTemp}°C` }
}

/** Live probe temperatures for a few tanks, straight from Frigid. A tank with no reading comes back null. */
export async function readTankTemps(tankIds: string[]): Promise<Record<string, number | null>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const out: Record<string, number | null> = Object.fromEntries(tankIds.map((id) => [id, null]))
  if (!user || !tankIds.length) return out
  try {
    const [{ data: tanks }, readings] = await Promise.all([
      supabase.from('tanks').select('id, frigid_tank_name').in('id', tankIds.slice(0, 10)),
      getFrigidReadings(),
    ])
    for (const t of tanks ?? []) {
      const temp = readings.find((r) => r.name === t.frigid_tank_name)?.temperature
      out[t.id] = temp != null ? Math.round(temp * 10) / 10 : null
    }
  } catch (err) {
    console.error('[readTankTemps] failed:', err instanceof Error ? err.message : err)
  }
  return out
}

/** Stop a tank's cooling (Frigid's resting set point). Used once a fermenter has been emptied by a transfer. */
export async function turnCoolingOff(tankId: string): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'You are signed out. Sign in again and retry.' }
  const { data: tank } = await supabase.from('tanks').select('name').eq('id', tankId).maybeSingle()
  if (!tank) return { success: false, message: 'Tank not found' }
  if (!(await coolingOff(tankId))) return { success: false, message: `Frigid did not accept that. ${tank.name} cooling is unchanged.` }
  revalidatePath('/')
  return { success: true, message: `${tank.name} cooling is off` }
}
