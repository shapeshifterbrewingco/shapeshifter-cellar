'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setTankTarget(tankId: string, targetTemp: number): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()

  const { data: tank, error } = await supabase
    .from('tanks')
    .select('frigid_asset_id, name')
    .eq('id', tankId)
    .single()

  if (error || !tank) return { success: false, message: 'Tank not found' }
  if (!tank.frigid_asset_id) return { success: false, message: `${tank.name} has no Frigid asset ID configured` }

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
  await supabase
    .from('tanks')
    .update({ desired_set_point_c: targetTemp })
    .eq('id', tankId)

  revalidatePath('/')
  return { success: true, message: `Setpoint updated to ${targetTemp}°C` }
}
