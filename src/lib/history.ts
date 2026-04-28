import type { SupabaseClient } from '@supabase/supabase-js'
import { calcAbv } from './utils'

export interface BrewReading {
  id: string
  recorded_at: string
  plato: number | null
  ph: number | null
  recorded_by: string
  notes: string | null
}

export interface PackagingRun {
  id: string
  format: string
  qty: number
  volume_l: number
  packaged_by: string
  packaged_at: string
  notes: string | null
}

export interface BrewHistoryItem {
  id: string
  batch_code: string | null
  beer_name: string
  style: string | null
  tank_name: string
  brew_day: string
  completed_at: string
  volume_l: number
  og_plato: number | null
  final_plato: number | null
  final_ph: number | null
  abv: number | null
  stage: string
  notes: string | null
  reading_count: number
  readings: BrewReading[]
  packaging_runs: PackagingRun[]
}

export async function getBrewHistory(supabase: SupabaseClient): Promise<BrewHistoryItem[]> {
  const { data: brews, error } = await supabase
    .from('brews')
    .select('id, batch_code, beer_name, style, tank_id, brew_day, deleted_at, volume_l, og_plato, stage, notes, tanks(name)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })

  if (error) throw error
  if (!brews?.length) return []

  const brewIds = brews.map((b: { id: string }) => b.id)

  const [{ data: readings }, { data: packagingRuns }] = await Promise.all([
    supabase
      .from('gravity_readings')
      .select('id, brew_id, recorded_at, plato, ph, recorded_by, notes')
      .in('brew_id', brewIds)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('packaging_runs')
      .select('id, brew_id, format, qty, volume_l, packaged_by, packaged_at, notes')
      .in('brew_id', brewIds)
      .order('packaged_at', { ascending: true }),
  ])

  const readingsByBrew = new Map<string, BrewReading[]>()
  for (const r of readings ?? []) {
    if (!readingsByBrew.has(r.brew_id)) readingsByBrew.set(r.brew_id, [])
    readingsByBrew.get(r.brew_id)!.push(r)
  }

  const packagingByBrew = new Map<string, PackagingRun[]>()
  for (const p of packagingRuns ?? []) {
    if (!packagingByBrew.has(p.brew_id)) packagingByBrew.set(p.brew_id, [])
    packagingByBrew.get(p.brew_id)!.push(p)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (brews as any[]).map((brew) => {
    const brewReadings = readingsByBrew.get(brew.id) ?? []
    const gravityReadings = brewReadings.filter((r) => r.plato != null || r.ph != null)
    const last = gravityReadings.at(-1)
    const finalPlato = last?.plato ?? null
    const finalPh = last?.ph ?? null
    const abv = brew.og_plato != null && finalPlato != null
      ? calcAbv(brew.og_plato, finalPlato)
      : null

    return {
      id: brew.id,
      batch_code: brew.batch_code,
      beer_name: brew.beer_name,
      style: brew.style,
      tank_name: (Array.isArray(brew.tanks) ? brew.tanks[0] : brew.tanks)?.name ?? '—',
      brew_day: brew.brew_day,
      completed_at: brew.deleted_at,
      volume_l: brew.volume_l,
      og_plato: brew.og_plato,
      final_plato: finalPlato,
      final_ph: finalPh,
      abv,
      stage: brew.stage,
      notes: brew.notes,
      reading_count: gravityReadings.length,
      readings: brewReadings,
      packaging_runs: packagingByBrew.get(brew.id) ?? [],
    }
  })
}
