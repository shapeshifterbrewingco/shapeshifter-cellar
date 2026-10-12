import type { SupabaseClient } from '@supabase/supabase-js'
import type { TankDashboardData, PackagingSplit, NextScheduledBrew } from '@/types'
import type { FrigidReading } from '@/lib/frigid'
import { breweryToday, daysBetweenISO } from '@/lib/dates'

// A stored reading stands in for a live one only while it is recent. Beyond
// that the card shows a dash: an old temperature presented as current is how a
// tank gets left warm.
const STALE_AFTER_MS = 30 * 60 * 1000
function freshOnly<T extends { recorded_at: string }>(reading: T | undefined): T | null {
  if (!reading) return null
  return Date.now() - new Date(reading.recorded_at).getTime() <= STALE_AFTER_MS ? reading : null
}

export async function getDashboardData(
  supabase: SupabaseClient,
  live: FrigidReading[] = [],
  // Next brew per tank name, from the Brewery Schedule calendar
  nextBrews: Record<string, NextScheduledBrew> = {},
): Promise<TankDashboardData[]> {
  // ── Tier 1: independent queries run in parallel ────────────────────────────
  const [
    { data: tanks, error: tanksError },
    { data: beerStyles },
    { data: brews, error: brewsError },
  ] = await Promise.all([
    supabase
      .from('tanks')
      .select('id, name, type, frigid_tank_name, frigid_asset_id, sort_order, desired_set_point_c')
      .eq('is_utility', false)
      .order('sort_order'),
    supabase
      .from('beer_styles')
      .select('name, hex_colour'),
    supabase
      .from('brews')
      .select('id, recipe_id, tank_id, brew_day, volume_l, og_plato, stage, beer_name, style, notes, batch_code, colour')
      .is('deleted_at', null)
      .not('stage', 'in', '(empty,transferred,packaged)'),
  ])

  if (tanksError) throw tanksError
  if (brewsError) throw brewsError

  const tankIds = (tanks ?? []).map((t: { id: string }) => t.id)
  const brewIds = (brews ?? []).map((b: { id: string }) => b.id)
  const today = breweryToday()

  const none = Promise.resolve({ data: [] as never[] })

  // ── Tier 2: queries that depend on tankIds / brewIds, all parallel ─────────
  const [
    { data: readings },
    { data: splits },
    { data: vdkReadings },
    { data: temps },
  ] = await Promise.all([
    brewIds.length > 0
      ? supabase
          .from('gravity_readings')
          .select('brew_id, plato, ph, recorded_at, recorded_by')
          .or('plato.not.is.null,ph.not.is.null')
          .in('brew_id', brewIds)
          .order('recorded_at', { ascending: false })
      : none,
    brewIds.length > 0
      ? supabase
          .from('packaging_splits')
          .select('id, brew_id, hop_load, qty_24x375, qty_16x440, qty_keg30, qty_keg50, notes')
          .in('brew_id', brewIds)
      : none,
    brewIds.length > 0
      ? supabase
          .from('vdk_readings')
          .select('brew_id, result, recorded_at')
          .in('brew_id', brewIds)
          .order('recorded_at', { ascending: false })
      : none,
    tankIds.length > 0
      ? supabase
          .from('temperature_readings')
          .select('tank_id, temperature_c, set_point_c, recorded_at')
          .in('tank_id', tankIds)
          .order('recorded_at', { ascending: false })
          .limit(tankIds.length * 5)
      : none,
  ])

  // ── Assemble lookup maps ───────────────────────────────────────────────────
  const styleColourMap = new Map<string, string>(
    (beerStyles ?? []).map((s: { name: string; hex_colour: string }) => [s.name, s.hex_colour])
  )

  // Stage changes and transfers are logged as readings with no numbers in
  // them. The card wants the last real measurement, and the latest gravity and
  // the latest pH are not always on the same row.
  const latestGravity: Record<string, { plato: number | null; ph: number | null; recorded_at: string; recorded_by: string }> = {}
  for (const r of readings ?? []) {
    if (r.plato == null && r.ph == null) continue
    const seen = latestGravity[r.brew_id]
    if (!seen) latestGravity[r.brew_id] = { ...r }
    else {
      if (seen.plato == null && r.plato != null) seen.plato = r.plato
      if (seen.ph == null && r.ph != null) seen.ph = r.ph
    }
  }

  const splitsByBrew: Record<string, PackagingSplit> = {}
  for (const s of splits ?? []) {
    splitsByBrew[s.brew_id] = s as PackagingSplit
  }

  const latestVdk: Record<string, { result: string; recorded_at: string }> = {}
  for (const v of vdkReadings ?? []) {
    if (!latestVdk[v.brew_id]) latestVdk[v.brew_id] = v
  }

  const latestTemp: Record<string, { temperature_c: number; set_point_c: number | null; recorded_at: string }> = {}
  for (const t of temps ?? []) {
    if (!latestTemp[t.tank_id]) latestTemp[t.tank_id] = t
  }

  const liveByName = new Map(live.map((r) => [r.name, r]))

  // ── Build output ───────────────────────────────────────────────────────────
  type BrewRow = { id: string; recipe_id: string | null; tank_id: string; brew_day: string; volume_l: number; og_plato: number | null; stage: string; beer_name: string; style: string | null; notes: string | null; batch_code: string | null; colour: string | null }
  type TankRow = { id: string; name: string; type: 'fermenter' | 'brite'; frigid_tank_name: string | null; frigid_asset_id: string | null; sort_order: number; desired_set_point_c: number | null }

  const brewByTank = new Map((brews as BrewRow[] ?? []).map((b) => [b.tank_id, b]))

  return (tanks as TankRow[] ?? []).map((tank) => {
    const brew = brewByTank.get(tank.id) ?? null
    const gravity = brew ? latestGravity[brew.id] ?? null : null
    // Live from the controller when it answers; the stored reading is the fallback
    const liveReading = tank.frigid_tank_name ? liveByName.get(tank.frigid_tank_name) : undefined
    const temp = liveReading?.temperature != null
      ? {
          temperature_c: liveReading.temperature,
          set_point_c: liveReading.setPoint,
          recorded_at: liveReading.lastTemperatureReading ?? new Date().toISOString(),
        }
      : freshOnly(latestTemp[tank.id])

    return {
      tank,
      brew: brew ? {
        id: brew.id,
        recipe_id: brew.recipe_id,
        tank_id: brew.tank_id,
        brew_day: brew.brew_day,
        volume_l: brew.volume_l,
        og_plato: brew.og_plato,
        stage: brew.stage as import('@/types').TankStage,
        beer_name: brew.beer_name,
        style: brew.style,
        notes: brew.notes,
        batch_code: brew.batch_code,
      } : null,
      latest_gravity: gravity ? {
        id: '',
        brew_id: brew?.id ?? '',
        tank_id: tank.id,
        recorded_at: gravity.recorded_at,
        plato: gravity.plato,
        ph: gravity.ph,
        recorded_by: gravity.recorded_by,
        notes: null,
      } : null,
      temperature: temp?.temperature_c ?? null,
      // Only ever what the controller says now, or said in the last half hour.
      // A remembered set point is worse than a blank: it looks like the truth.
      set_point_c: liveReading?.setPoint ?? temp?.set_point_c ?? null,
      temperature_recorded_at: temp?.recorded_at ?? null,
      days_in_tank: brew?.brew_day ? daysBetweenISO(brew.brew_day.slice(0, 10), today) : null,
      // A colour picked for this beer wins over its style's
      style_colour: brew?.colour ?? (brew?.style ? (styleColourMap.get(brew.style) ?? null) : null),
      latest_vdk: brew ? (latestVdk[brew.id] as import('@/types').TankDashboardData['latest_vdk'] ?? null) : null,
      packaging_split: brew ? (splitsByBrew[brew.id] ?? null) : null,
      next_scheduled_brew: !brew ? (nextBrews[tank.name] ?? null) : null,
    }
  })
}
