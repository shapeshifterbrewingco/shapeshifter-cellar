import type { SupabaseClient } from '@supabase/supabase-js'
import type { TankDashboardData, PackagingSplit, NextScheduledBrew } from '@/types'
import { differenceInDays } from 'date-fns'

export async function getDashboardData(supabase: SupabaseClient): Promise<TankDashboardData[]> {
  // 1. All tanks
  const { data: tanks, error: tanksError } = await supabase
    .from('tanks')
    .select('id, name, type, frigid_tank_name, frigid_asset_id, sort_order, desired_set_point_c')
    .eq('is_utility', false)
    .order('sort_order')

  if (tanksError) throw tanksError

  const tankIds = tanks?.map((t: { id: string }) => t.id) ?? []

  // 2. Beer styles (for colour resolution)
  const { data: beerStyles } = await supabase
    .from('beer_styles')
    .select('name, hex_colour')
  const styleColourMap = new Map<string, string>((beerStyles ?? []).map((s: { name: string; hex_colour: string }) => [s.name, s.hex_colour]))

  // 3. Active brews (not transferred/packaged/empty)
  const { data: brews, error: brewsError } = await supabase
    .from('brews')
    .select('id, recipe_id, tank_id, brew_day, volume_l, og_plato, stage, beer_name, style, notes, batch_code')
    .is('deleted_at', null)
    .not('stage', 'in', '(empty,transferred,packaged)')

  if (brewsError) throw brewsError

  // 4. Latest gravity reading per brew (one query, filter client-side)
  const brewIds = brews?.map((b: { id: string }) => b.id) ?? []
  let latestGravity: Record<string, { plato: number | null; ph: number | null; recorded_at: string; recorded_by: string }> = {}

  if (brewIds.length > 0) {
    const { data: readings } = await supabase
      .from('gravity_readings')
      .select('brew_id, plato, ph, recorded_at, recorded_by')
      .in('brew_id', brewIds)
      .order('recorded_at', { ascending: false })

    // Keep only the most recent per brew
    for (const r of readings ?? []) {
      if (!latestGravity[r.brew_id]) latestGravity[r.brew_id] = r
    }
  }

  // 5. Packaging splits per brew
  let splitsByBrew: Record<string, PackagingSplit> = {}
  if (brewIds.length > 0) {
    const { data: splits } = await supabase
      .from('packaging_splits')
      .select('id, brew_id, hop_load, qty_24x375, qty_16x440, qty_keg30, qty_keg50, notes')
      .in('brew_id', brewIds)
    for (const s of splits ?? []) {
      splitsByBrew[s.brew_id] = s as PackagingSplit
    }
  }

  // 6. Next scheduled brew per tank (for empty tank cards)
  const today = new Date().toISOString().slice(0, 10)
  const nextScheduledByTank = new Map<string, NextScheduledBrew>()
  if (tankIds.length > 0) {
    const { data: upcoming } = await supabase
      .from('scheduled_brews')
      .select('id, tank_id, scheduled_date, recipe_name, recipes(name)')
      .eq('event_type', 'brew')
      .not('status', 'in', '(done,cancelled)')
      .gte('scheduled_date', today)
      .in('tank_id', tankIds)
      .order('scheduled_date', { ascending: true })

    for (const s of upcoming ?? []) {
      if (s.tank_id && !nextScheduledByTank.has(s.tank_id)) {
        const recipe = Array.isArray(s.recipes) ? s.recipes[0] ?? null : (s.recipes as { name: string } | null)
        nextScheduledByTank.set(s.tank_id, {
          id: s.id,
          scheduled_date: s.scheduled_date,
          recipe_name: s.recipe_name,
          recipe: recipe ? { name: (recipe as { name: string }).name } : null,
        })
      }
    }
  }

  // 7. Latest VDK reading per brew
  let latestVdk: Record<string, { result: string; recorded_at: string }> = {}
  if (brewIds.length > 0) {
    const { data: vdkReadings } = await supabase
      .from('vdk_readings')
      .select('brew_id, result, recorded_at')
      .in('brew_id', brewIds)
      .order('recorded_at', { ascending: false })
    for (const v of vdkReadings ?? []) {
      if (!latestVdk[v.brew_id]) latestVdk[v.brew_id] = v
    }
  }

  // 8. Latest temperature per tank
  const latestTemp: Record<string, { temperature_c: number; set_point_c: number | null; recorded_at: string }> = {}

  if (tankIds.length > 0) {
    // Get latest temp for each tank via a single query ordered by time desc
    const { data: temps } = await supabase
      .from('temperature_readings')
      .select('tank_id, temperature_c, set_point_c, recorded_at')
      .in('tank_id', tankIds)
      .order('recorded_at', { ascending: false })
      .limit(tankIds.length * 5) // enough to get one per tank

    for (const t of temps ?? []) {
      if (!latestTemp[t.tank_id]) latestTemp[t.tank_id] = t
    }
  }

  // 9. Assemble
  type BrewRow = { id: string; recipe_id: string | null; tank_id: string; brew_day: string; volume_l: number; og_plato: number | null; stage: string; beer_name: string; style: string | null; notes: string | null; batch_code: string | null }
  type TankRow = { id: string; name: string; type: 'fermenter' | 'brite'; frigid_tank_name: string | null; frigid_asset_id: string | null; sort_order: number; desired_set_point_c: number | null }

  const brewByTank = new Map((brews as BrewRow[] ?? []).map((b) => [b.tank_id, b]))

  return (tanks as TankRow[] ?? []).map((tank) => {
    const brew = brewByTank.get(tank.id) ?? null
    const gravity = brew ? latestGravity[brew.id] ?? null : null
    const temp = latestTemp[tank.id] ?? null

    return {
      tank,
      brew: brew
        ? {
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
          }
        : null,
      latest_gravity: gravity
        ? {
            id: '',
            brew_id: brew?.id ?? '',
            tank_id: tank.id,
            recorded_at: gravity.recorded_at,
            plato: gravity.plato,
            ph: gravity.ph,
            recorded_by: gravity.recorded_by,
            notes: null,
          }
        : null,
      temperature: temp?.temperature_c ?? null,
      set_point_c: tank.desired_set_point_c ?? temp?.set_point_c ?? null,
      temperature_recorded_at: temp?.recorded_at ?? null,
      days_in_tank: brew?.brew_day ? differenceInDays(new Date(), new Date(brew.brew_day)) : null,
      style_colour: brew?.style ? (styleColourMap.get(brew.style) ?? null) : null,
      latest_vdk: brew ? (latestVdk[brew.id] as import('@/types').TankDashboardData['latest_vdk'] ?? null) : null,
      packaging_split: brew ? (splitsByBrew[brew.id] ?? null) : null,
      next_scheduled_brew: !brew ? (nextScheduledByTank.get(tank.id) ?? null) : null,
    }
  })
}
