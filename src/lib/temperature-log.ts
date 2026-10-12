import { createServiceClient } from '@/lib/supabase/server'
import type { FrigidReading } from '@/lib/frigid'

// One stored reading per tank per ten minutes is plenty for a fermentation
// chart and keeps the table to a few thousand rows a day.
const BUCKET_MS = 10 * 60 * 1000

/**
 * Stores the readings that are newer than what each tank already has.
 * Called by the poller, and by the dashboard after it renders, so the charts
 * fill in whenever either is running.
 */
export async function recordTemperatures(readings: FrigidReading[]): Promise<{ inserted: number; error?: string }> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { inserted: 0, error: 'Service role key not configured' }
  const usable = readings.filter((r) => r.temperature != null && r.lastTemperatureReading)
  if (usable.length === 0) return { inserted: 0 }

  const supabase = createServiceClient()

  const { data: tanks, error: tanksError } = await supabase
    .from('tanks')
    .select('id, frigid_tank_name')
    .not('frigid_tank_name', 'is', null)
  if (tanksError) return { inserted: 0, error: tanksError.message }

  const tankIdByName = new Map<string, string>(
    (tanks ?? []).map((t: { id: string; frigid_tank_name: string }) => [t.frigid_tank_name, t.id])
  )

  const since = new Date(Date.now() - BUCKET_MS).toISOString()
  const { data: recent, error: recentError } = await supabase
    .from('temperature_readings')
    .select('tank_id')
    .gte('recorded_at', since)
  if (recentError) return { inserted: 0, error: recentError.message }
  const alreadyLogged = new Set((recent ?? []).map((r: { tank_id: string }) => r.tank_id))

  const rows = usable
    .filter((r) => tankIdByName.has(r.name) && !alreadyLogged.has(tankIdByName.get(r.name)!))
    // A sensor that stopped reporting keeps its old timestamp; do not log it as fresh
    .filter((r) => new Date(r.lastTemperatureReading!).getTime() >= Date.now() - BUCKET_MS)
    .map((r) => ({
      tank_id: tankIdByName.get(r.name)!,
      recorded_at: r.lastTemperatureReading!,
      temperature_c: r.temperature!,
      set_point_c: r.setPoint,
    }))

  if (rows.length === 0) return { inserted: 0 }
  const { error } = await supabase.from('temperature_readings').insert(rows)
  if (error) return { inserted: 0, error: error.message }
  return { inserted: rows.length }
}
