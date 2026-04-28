import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGE_FORMATS } from '@/types'

export interface PackagingReportRun {
  id: string
  packaged_at: string
  format: string
  format_label: string
  qty: number
  volume_l: number
  packaged_by: string
  notes: string | null
}

export interface PackagingReportItem {
  brew_id: string
  batch_code: string | null
  beer_name: string
  style: string | null
  tank_name: string
  brew_day: string
  og_plato: number | null
  final_plato: number | null
  abv: number | null
  total_volume_l: number
  runs: PackagingReportRun[]
}

export async function getPackagingReports(supabase: SupabaseClient): Promise<PackagingReportItem[]> {
  const { data: runs, error } = await supabase
    .from('packaging_runs')
    .select(`
      id, brew_id, format, qty, volume_l, packaged_by, packaged_at, notes,
      brews(id, batch_code, beer_name, style, brew_day, og_plato, stage, tanks(name))
    `)
    .order('packaged_at', { ascending: false })

  if (error) throw error
  if (!runs?.length) return []

  // Fetch final gravity for ABV calculation
  const brewIds = [...new Set(runs.map((r: { brew_id: string }) => r.brew_id))]
  const { data: readings } = await supabase
    .from('gravity_readings')
    .select('brew_id, plato')
    .in('brew_id', brewIds)
    .not('plato', 'is', null)
    .order('recorded_at', { ascending: false })

  const lastGravityByBrew = new Map<string, number>()
  for (const r of readings ?? []) {
    if (!lastGravityByBrew.has(r.brew_id)) {
      lastGravityByBrew.set(r.brew_id, r.plato)
    }
  }

  // Group runs by brew
  const byBrew = new Map<string, PackagingReportItem>()

  for (const run of runs as any[]) {
    const brew = Array.isArray(run.brews) ? run.brews[0] : run.brews
    if (!brew) continue

    const tank = Array.isArray(brew.tanks) ? brew.tanks[0] : brew.tanks
    const fmt = PACKAGE_FORMATS.find(f => f.format === run.format)

    const runEntry: PackagingReportRun = {
      id: run.id,
      packaged_at: run.packaged_at,
      format: run.format,
      format_label: fmt?.label ?? run.format,
      qty: run.qty,
      volume_l: run.volume_l,
      packaged_by: run.packaged_by,
      notes: run.notes,
    }

    if (!byBrew.has(run.brew_id)) {
      const finalPlato = lastGravityByBrew.get(run.brew_id) ?? null
      const abv =
        brew.og_plato != null && finalPlato != null
          ? Math.round(((brew.og_plato - finalPlato) / 7.75) * 10) / 10
          : null

      byBrew.set(run.brew_id, {
        brew_id: run.brew_id,
        batch_code: brew.batch_code ?? null,
        beer_name: brew.beer_name,
        style: brew.style ?? null,
        tank_name: tank?.name ?? '—',
        brew_day: brew.brew_day,
        og_plato: brew.og_plato ?? null,
        final_plato: finalPlato,
        abv,
        total_volume_l: 0,
        runs: [],
      })
    }

    const item = byBrew.get(run.brew_id)!
    item.runs.push(runEntry)
    item.total_volume_l += run.volume_l
  }

  return Array.from(byBrew.values())
}
