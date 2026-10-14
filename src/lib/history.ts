import type { SupabaseClient } from '@supabase/supabase-js'
import { calcAbv } from './utils'

export interface BrewReading {
  id: string
  recorded_at: string
  plato: number | null
  ph: number | null
  temperature_c?: number | null
  recorded_by: string
  notes: string | null
}

export interface VdkEntry { id: string; recorded_at: string; result: string; recorded_by: string; notes: string | null }

export interface PackagingRun {
  id: string
  format: string
  qty: number
  volume_l: number
  packaged_by: string
  packaged_at: string
  notes: string | null
}

/** The packaging report from the back of the paper brew sheet. Every field is optional. */
export interface PackReport {
  best_before: string | null
  bbt_temp_c: number | null
  bbt_co2_vol: number | null
  /** Lowest DO reading. With a high beside it, the two are a range. */
  bbt_do_ppb: number | null
  bbt_do_ppb_high: number | null
  pack_co2_vol: number | null
  pack_do_ppb: number | null
  pack_do_ppb_high: number | null
  unders: string | null
  stock_venue_kegs: number | null
  stock_venue_cartons: number | null
  stock_options_kegs: number | null
  stock_options_cartons: number | null
  stock_sales_kegs: number | null
  stock_sales_cartons: number | null
  notes: string | null
}

export const PACK_REPORT_FIELDS = [
  'best_before', 'bbt_temp_c', 'bbt_co2_vol', 'bbt_do_ppb', 'bbt_do_ppb_high', 'pack_co2_vol', 'pack_do_ppb', 'pack_do_ppb_high', 'unders',
  'stock_venue_kegs', 'stock_venue_cartons', 'stock_options_kegs', 'stock_options_cartons',
  'stock_sales_kegs', 'stock_sales_cartons', 'notes',
] as const

/** Dissolved oxygen limits, in ppb. A batch is inside when its highest reading is under the line. */
export const DO_SPEC = { brite: 20, pack: 50 }

/** The worst DO reading written down for a batch, or null when there is none. */
export const doWorst = (low: number | null | undefined, high: number | null | undefined) =>
  low == null && high == null ? null : Math.max(Number(low ?? high), Number(high ?? low))

/** A DO reading as text: "59 to 73 ppb", "23 ppb", or "-" when nothing was recorded. */
export function doRange(low: number | null | undefined, high: number | null | undefined): string {
  if (low == null && high == null) return '-'
  if (low != null && high != null && Number(low) !== Number(high)) return `${Number(low)} to ${Number(high)} ppb`
  return `${Number(low ?? high)} ppb`
}

/** How many of each pack format a batch made. */
export type PackCounts = { keg20: number; keg30: number; keg50: number; c24: number; c16: number }

/** One packaging run, trimmed to what the period summary adds up. */
export interface PackedRun { packaged_at: string; format: string; qty: number; volume_l: number }

export interface BrewHistoryItem {
  id: string
  batch_code: string | null
  beer_name: string
  style: string | null
  tank_name: string
  brew_day: string
  completed_at: string
  volume_l: number
  /** What went into the fermenter on brew day, off the brew sheet. Yield is measured against this, not what was left after bottoms and a transfer. */
  fv_volume_l: number
  og_plato: number | null
  final_plato: number | null
  final_ph: number | null
  abv: number | null
  /** What the batch was brewed to: its own target, or the linked recipe's */
  target_abv: number | null
  target_og_plato: number | null
  /** An old paper sheet with no packaging report: brewed, but what it packed was never written down */
  packaging_unrecorded: boolean
  stage: string
  notes: string | null
  reading_count: number
  /** When the last packaging run was logged, if any */
  packed_at: string | null
  packed_l: number
  packed: PackCounts
  /** When it moved from fermenter to brite, if it did */
  transferred_at: string | null
  report: PackReport | null
  /** "2026-10": the brewery-local month it left the cellar. Groups the list. */
  month: string
  hops: string[]
  yeast: string[]
  /** Loaded when a batch is opened, not with the list */
  readings: BrewReading[]
  packaging_runs: PackagingRun[]
}

const PAGE = 1000

/** Every row of a query, a page at a time. The API hands back at most 1,000 rows per request. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

const monthOf = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit' }).format(new Date(iso)).slice(0, 7)

const tidy = (names: (string | null | undefined)[]) => {
  const seen = new Map<string, string>()
  for (const n of names) {
    const t = (n ?? '').trim()
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t)
  }
  return [...seen.values()]
}

type Line = { name?: string }

/** "Amarillo® Brand VGXP01 T-90 Pellets 1×5kg" -> "Amarillo". Supplier catalogue names are not how anyone says a hop. */
const hopName = (raw: string) =>
  raw
    .replace(/[®™©]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?\s*(kg|g)\b/gi, ' ')
    .replace(/\b\d+(\.\d+)?\s*(kg|g)\b/gi, ' ')
    .replace(/\b(brand|pellets?|hops?|t[\s-]?90|t[\s-]?45)\b/gi, ' ')
    .replace(/\b[A-Z]{2,}\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || raw.trim()

/**
 * The History list: one light row per finished brew. Readings and packaging
 * runs are left out on purpose and fetched per batch when it is opened, so the
 * page stays quick with hundreds of brews on file.
 */
export async function getBrewHistory(supabase: SupabaseClient): Promise<BrewHistoryItem[]> {
  const brews = await all<{
    id: string; batch_code: string | null; beer_name: string; style: string | null; brew_day: string; deleted_at: string
    volume_l: number; og_plato: number | null; stage: string; notes: string | null; recipe_id: string | null
    target_abv: number | null; target_og_plato: number | null; packaging_unrecorded: boolean | null
    tanks: { name: string } | { name: string }[] | null
  }>((from, to) =>
    supabase
      .from('brews')
      .select('id, batch_code, beer_name, style, brew_day, deleted_at, volume_l, og_plato, stage, notes, recipe_id, target_abv, target_og_plato, packaging_unrecorded, tanks(name)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(from, to),
  )
  if (!brews.length) return []

  const recipeIds = [...new Set(brews.map((b) => b.recipe_id).filter((x): x is string => !!x))]

  const [finals, sheets, recipeLines, runs, transfers, reports, recipes] = await Promise.all([
    all<{ brew_id: string; final_plato: number | null; final_ph: number | null; reading_count: number; packed_at: string | null; packed_l: number }>((from, to) =>
      supabase.from('brew_finals').select('brew_id, final_plato, final_ph, reading_count, packed_at, packed_l').range(from, to),
    ),
    // Only the parts of each brew sheet that name a hop or a yeast
    all<{ brew_id: string; kettle_hops: Line[] | null; dry_hops: Line[] | null; mash_additions: Line[] | null; yeast: string | null; fv_volume: string | null }>((from, to) =>
      supabase
        .from('brew_sheets')
        .select('brew_id, kettle_hops:data->kettle_hops, dry_hops:data->dry_hops, mash_additions:data->mash_additions, yeast:data->yeast->>strain, fv_volume:data->fv->>volume_l')
        .range(from, to),
    ),
    recipeIds.length
      ? all<{ recipe_id: string; name: string; addition_stage: string; category: string }>((from, to) =>
          supabase
            .from('recipe_ingredients')
            .select('recipe_id, name, addition_stage, category')
            .in('recipe_id', recipeIds)
            .in('addition_stage', ['kettle_hop', 'dry_hop', 'mash_hop', 'yeast'])
            .range(from, to),
        )
      : Promise.resolve([]),
    all<{ brew_id: string; format: string; qty: number }>((from, to) =>
      supabase.from('packaging_runs').select('brew_id, format, qty').range(from, to),
    ),
    all<{ brew_id: string; transferred_at: string }>((from, to) =>
      supabase.from('transfers').select('brew_id, transferred_at').order('transferred_at', { ascending: true }).range(from, to),
    ),
    all<PackReport & { brew_id: string }>((from, to) =>
      supabase.from('packaging_reports').select(`brew_id, ${PACK_REPORT_FIELDS.join(', ')}`).range(from, to),
    ),
    recipeIds.length
      ? all<{ id: string; target_abv: number | null; target_og_plato: number | null }>((from, to) =>
          supabase.from('recipes').select('id, target_abv, target_og_plato').in('id', recipeIds).range(from, to),
        )
      : Promise.resolve([]),
  ])
  const recipeBy = new Map(recipes.map((r) => [r.id, r]))
  const num = (v: number | null | undefined) => (v != null ? Number(v) : null)

  const packedBy = new Map<string, PackCounts>()
  const FORMAT_KEY: Record<string, keyof PackCounts> = { keg20: 'keg20', keg30: 'keg30', keg50: 'keg50', '24x375': 'c24', '16x440': 'c16' }
  for (const r of runs) {
    const k = FORMAT_KEY[r.format]
    if (!k) continue
    const c = packedBy.get(r.brew_id) ?? { keg20: 0, keg30: 0, keg50: 0, c24: 0, c16: 0 }
    c[k] += Number(r.qty)
    packedBy.set(r.brew_id, c)
  }
  // Rows arrive oldest first, so the first one kept is the move out of the fermenter
  const transferBy = new Map<string, string>()
  for (const t of transfers) if (!transferBy.has(t.brew_id)) transferBy.set(t.brew_id, t.transferred_at)
  const reportBy = new Map(reports.map(({ brew_id, ...r }) => [brew_id, r as PackReport]))

  const finalBy = new Map(finals.map((f) => [f.brew_id, f]))
  const sheetBy = new Map(sheets.map((s) => [s.brew_id, s]))
  const recipeHops = new Map<string, string[]>()
  const recipeYeast = new Map<string, string[]>()
  for (const l of recipeLines) {
    const into = l.addition_stage === 'yeast' ? recipeYeast : recipeHops
    // The dry hop section of a recipe also carries enzymes and finings; keep the hops
    if (into === recipeHops && l.category && l.category !== 'hop') continue
    into.set(l.recipe_id, [...(into.get(l.recipe_id) ?? []), l.name])
  }

  // A brew sheet's dry hop list includes ALDC, zinc and the like. Those are not hops.
  const notAHop = /aldc|enzyme|zinc|antifoam|hop ?aid|biofine|finings|nutrient|servomyces|whirlfloc|poly ?gel|tetra|calcium|gypsum|lactic|acid/i

  return brews.map((b) => {
    const f = finalBy.get(b.id)
    const s = sheetBy.get(b.id)
    const sheetHops = [...(s?.kettle_hops ?? []), ...(s?.dry_hops ?? [])].map((l) => l?.name).filter((n) => n && !notAHop.test(n))
    const finalPlato = f?.final_plato != null ? Number(f.final_plato) : null
    const og = b.og_plato != null ? Number(b.og_plato) : null
    const leftAt = f?.packed_at ?? b.deleted_at
    return {
      id: b.id,
      batch_code: b.batch_code,
      beer_name: b.beer_name,
      style: b.style,
      tank_name: (Array.isArray(b.tanks) ? b.tanks[0] : b.tanks)?.name ?? '—',
      brew_day: b.brew_day,
      completed_at: b.deleted_at,
      volume_l: Number(b.volume_l),
      fv_volume_l: parseFloat(s?.fv_volume ?? '') > 0 ? parseFloat(s!.fv_volume!) : Number(b.volume_l),
      og_plato: og,
      final_plato: finalPlato,
      final_ph: f?.final_ph != null ? Number(f.final_ph) : null,
      abv: og != null && finalPlato != null ? calcAbv(og, finalPlato) : null,
      target_abv: num(b.target_abv) ?? num(b.recipe_id ? recipeBy.get(b.recipe_id)?.target_abv : null),
      target_og_plato: num(b.target_og_plato) ?? num(b.recipe_id ? recipeBy.get(b.recipe_id)?.target_og_plato : null),
      packaging_unrecorded: b.packaging_unrecorded === true,
      stage: b.stage,
      notes: b.notes,
      reading_count: f?.reading_count ?? 0,
      packed_at: f?.packed_at ?? null,
      packed_l: Number(f?.packed_l ?? 0),
      packed: packedBy.get(b.id) ?? { keg20: 0, keg30: 0, keg50: 0, c24: 0, c16: 0 },
      transferred_at: transferBy.get(b.id) ?? null,
      report: reportBy.get(b.id) ?? null,
      month: monthOf(leftAt),
      hops: tidy([...sheetHops, ...(b.recipe_id ? recipeHops.get(b.recipe_id) ?? [] : [])].map((n) => (n ? hopName(n) : n))),
      yeast: tidy([s?.yeast, ...(b.recipe_id ? recipeYeast.get(b.recipe_id) ?? [] : [])]),
      readings: [],
      packaging_runs: [],
    }
  })
}

/** Readings and packaging runs for one batch, fetched when it is opened. */
export async function getBrewHistoryDetail(supabase: SupabaseClient, brewId: string): Promise<{ readings: BrewReading[]; packaging_runs: PackagingRun[]; vdk: VdkEntry[] }> {
  const [{ data: readings, error: rErr }, { data: runs, error: pErr }, { data: vdk }] = await Promise.all([
    supabase
      .from('gravity_readings')
      .select('id, recorded_at, plato, ph, temperature_c, recorded_by, notes')
      .eq('brew_id', brewId)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('packaging_runs')
      .select('id, format, qty, volume_l, packaged_by, packaged_at, notes')
      .eq('brew_id', brewId)
      .order('packaged_at', { ascending: true }),
    supabase
      .from('vdk_readings')
      .select('id, recorded_at, result, recorded_by, notes')
      .eq('brew_id', brewId)
      .order('recorded_at', { ascending: true }),
  ])
  if (rErr) throw new Error(rErr.message)
  if (pErr) throw new Error(pErr.message)
  return { readings: (readings ?? []) as BrewReading[], packaging_runs: (runs ?? []) as PackagingRun[], vdk: (vdk ?? []) as VdkEntry[] }
}

/** Every packaging run, light, for the period summary at the top of History. */
export async function getPackedRuns(supabase: SupabaseClient): Promise<PackedRun[]> {
  const rows = await all<PackedRun>((from, to) =>
    supabase.from('packaging_runs').select('packaged_at, format, qty, volume_l').order('packaged_at', { ascending: false }).range(from, to),
  )
  return rows.map((r) => ({ ...r, qty: Number(r.qty), volume_l: Number(r.volume_l) }))
}
