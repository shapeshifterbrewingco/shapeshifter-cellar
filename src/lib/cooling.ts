// Switching a tank's cooling off when it is emptied. Frigid has no "off": a
// set point of 200°C is its way of saying the tank is not being held anywhere.

import { createServiceClient } from '@/lib/supabase/server'
import { FRIGID_OFF_SET_POINT } from '@/lib/frigid'

/**
 * Put a tank back to Frigid's resting set point. Never throws: the tank has
 * already been emptied, so a failure comes back as false for the caller to mention.
 */
export async function coolingOff(tankId: string): Promise<boolean> {
  try {
    const db = createServiceClient()
    const { data: tank } = await db.from('tanks').select('frigid_asset_id, name').eq('id', tankId).maybeSingle()
    const apiKey = process.env.FRIGID_API_KEY
    const apiUrl = process.env.FRIGID_API_URL
    if (!tank?.frigid_asset_id || !apiKey || !apiUrl) return false

    const res = await fetch(`${apiUrl}/asset/target`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: tank.frigid_asset_id, target: FRIGID_OFF_SET_POINT, unitTemperature: 'C' }),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => ({})) as { success?: boolean }
    if (!res.ok || !json.success) {
      console.error('[coolingOff] Frigid refused for', tank.name, res.status)
      return false
    }
    await db.from('tanks').update({ desired_set_point_c: FRIGID_OFF_SET_POINT }).eq('id', tankId)
    return true
  } catch (err) {
    console.error('[coolingOff] failed:', err instanceof Error ? err.message : err)
    return false
  }
}
