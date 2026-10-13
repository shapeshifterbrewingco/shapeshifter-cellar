// What the planner chat can read from the cellar's own records: ingredient
// usage off the brew sheets, the recipes, and finished batches. Read-only.

import { createClient } from '@/lib/supabase/server'
import { getBrewHistory, doRange } from '@/lib/history'

type Line = { name?: string; amount?: string | number; unit?: string; when?: string }
type SheetData = Partial<Record<'malt' | 'mash_additions' | 'kettle_additions' | 'kettle_hops' | 'dry_hops', Line[]>> & { yeast?: { strain?: string; amount?: string } }

// The hop lists on a brew sheet also carry finings, enzymes, flavours and spirit
const NOT_A_HOP = /aldc|enzyme|zinc|antifoam|hop ?aid|biofine|finings|nutrient|servomyces|whirlfloc|poly ?gel|tetra|calcium|gypsum|lactic|acid|flavour|flavor|spirit|sorbate|metabisulph|puree|purée|coffee|colouring|tincture|brewgas|sky farms|sugar|juice|lactose|vanilla|cacao|coconut|salt|ethanol/i

/** "Vic Secret 2022" and "Amarillo® Brand VGXP01 T-90 Pellets 1x5kg" are the same hop to a contract. Product forms (Lupo, Dynaboost, Incognito, oils) stay separate. */
function tidyName(raw: string): string {
  const t = raw
    .replace(/[®™©]/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*[x×]\s*\d+(\.\d+)?\s*(kg|g)\b/gi, ' ')
    .replace(/\b(brand|pellets?|t[\s-]?90)\b/gi, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\bVGXP\d+\b/gi, ' ')
    // Notes in brackets ("(Onsite)", "(AA17)", "(CTZ)") and a trailing crop year like "-22"
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s-\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^ctz$/i.test(t)) return 'Columbus'
  if (/^man bav$/i.test(t)) return 'Mandarina Bavaria'
  return t || raw.trim()
}

/** Amount in kg for solids or litres for liquids. Null when the sheet has no usable number. */
function measure(l: Line): { qty: number; unit: 'kg' | 'L' } | null {
  const n = parseFloat(String(l.amount ?? '').replace(',', ''))
  if (!Number.isFinite(n) || n <= 0) return null
  const u = (l.unit ?? '').trim().toLowerCase()
  if (u === 'kg') return { qty: n, unit: 'kg' }
  if (u === 'g') return { qty: n / 1000, unit: 'kg' }
  if (u === 'l') return { qty: n, unit: 'L' }
  if (u === 'ml') return { qty: n / 1000, unit: 'L' }
  return null
}

export type UsageKind = 'hops' | 'malt' | 'other'

/**
 * Adds up what the brew sheets say went into every batch brewed between two
 * dates. Brew sheets are what was actually weighed out, so this is real usage,
 * not the recipe.
 */
export async function ingredientUsage(from: string, to: string, kind: UsageKind) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('brew_sheets')
    .select('data, brews!inner(batch_code, beer_name, brew_day, volume_l)')
    .gte('brews.brew_day', from)
    .lte('brews.brew_day', to)
    .limit(1000)
  if (error) throw new Error(error.message)

  type Row = { data: SheetData; brews: { batch_code: string | null; beer_name: string; brew_day: string; volume_l: number } }
  const rows = (data ?? []).map((r) => ({ ...r, brews: Array.isArray(r.brews) ? r.brews[0] : r.brews })) as Row[]

  const totals = new Map<string, { name: string; unit: 'kg' | 'L'; total: number; batches: Set<string>; beers: Map<string, number>; kettle: number; dry: number }>()
  const unmeasured = new Map<string, number>()
  const beers = new Map<string, number>()
  let first = ''
  let last = ''

  for (const r of rows) {
    const b = r.brews
    const id = `${b.batch_code ?? ''}|${b.beer_name}|${b.brew_day}`
    beers.set(b.beer_name, (beers.get(b.beer_name) ?? 0) + 1)
    if (!first || b.brew_day < first) first = b.brew_day
    if (!last || b.brew_day > last) last = b.brew_day

    const hopLines = [...(r.data.kettle_hops ?? []).map((l) => ({ l, side: 'kettle' as const })), ...(r.data.dry_hops ?? []).map((l) => ({ l, side: 'dry' as const }))]
    const picked: { l: Line; side: 'kettle' | 'dry' | null }[] =
      kind === 'hops' ? hopLines.filter(({ l }) => l.name && !NOT_A_HOP.test(l.name))
      : kind === 'malt' ? (r.data.malt ?? []).map((l) => ({ l, side: null }))
      : [
          ...(r.data.mash_additions ?? []), ...(r.data.kettle_additions ?? []),
          ...hopLines.map(({ l }) => l).filter((l) => l.name && NOT_A_HOP.test(l.name)),
        ].map((l) => ({ l, side: null }))

    for (const { l, side } of picked) {
      if (!l.name?.trim()) continue
      const name = kind === 'hops' ? tidyName(l.name) : l.name.trim()
      const m = measure(l)
      if (!m) { unmeasured.set(name, (unmeasured.get(name) ?? 0) + 1); continue }
      const key = `${name.toLowerCase()}|${m.unit}`
      const t = totals.get(key) ?? { name, unit: m.unit, total: 0, batches: new Set<string>(), beers: new Map<string, number>(), kettle: 0, dry: 0 }
      t.total += m.qty
      t.batches.add(id)
      t.beers.set(b.beer_name, (t.beers.get(b.beer_name) ?? 0) + m.qty)
      if (side === 'kettle') t.kettle += m.qty
      if (side === 'dry') t.dry += m.qty
      totals.set(key, t)
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    kind,
    asked_for: { from, to },
    // The brew sheets only go back as far as they were loaded; say so rather than imply a full year
    brews_counted: rows.length,
    first_brew_day: first || null,
    last_brew_day: last || null,
    batches_by_beer: Object.fromEntries([...beers.entries()].sort((a, b) => b[1] - a[1])),
    usage: [...totals.values()]
      .sort((a, b) => b.total - a.total)
      .map((t) => ({
        name: t.name,
        total: r2(t.total),
        unit: t.unit,
        batches: t.batches.size,
        ...(kind === 'hops' ? { kettle: r2(t.kettle), dry_hop: r2(t.dry) } : {}),
        by_beer: Object.fromEntries([...t.beers.entries()].sort((a, b) => b[1] - a[1]).map(([beer, q]) => [beer, r2(q)])),
      })),
    lines_with_no_amount: Object.fromEntries(unmeasured),
  }
}

/** Recipes on file, with targets and every ingredient line. Pass a name to narrow it. */
export async function recipeBook(name?: string) {
  const supabase = await createClient()
  let q = supabase
    .from('recipes')
    .select('name, style, version, brew_volume_l, target_og_plato, target_fg_plato, target_abv, target_ibu, recipe_ingredients(name, category, addition_stage, quantity, unit, time_minutes, trigger, sort_order)')
    .is('deleted_at', null)
    .order('name')
  if (name?.trim()) q = q.ilike('name', `%${name.trim()}%`)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  type Ing = { name: string; category: string | null; addition_stage: string; quantity: number | null; unit: string | null; time_minutes: number | null; trigger: string | null; sort_order: number | null }
  return (data ?? []).map((r) => ({
    name: r.name, style: r.style, version: r.version, batch_litres: r.brew_volume_l,
    target: { og_plato: r.target_og_plato, fg_plato: r.target_fg_plato, abv: r.target_abv, ibu: r.target_ibu },
    ingredients: ((r.recipe_ingredients ?? []) as Ing[])
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((i) => ({
        name: i.name, stage: i.addition_stage, ...(i.category ? { category: i.category } : {}),
        qty: i.quantity, unit: i.unit,
        ...(i.time_minutes != null ? { minutes: i.time_minutes } : {}), ...(i.trigger ? { when: i.trigger } : {}),
      })),
  }))
}

/** Finished batches brewed between two dates: what went in, what came out. */
export async function batchHistory(from: string, to: string, beer?: string) {
  const supabase = await createClient()
  const items = await getBrewHistory(supabase)
  const want = beer?.trim().toLowerCase()
  return items
    .filter((i) => i.brew_day >= from && i.brew_day <= to && (!want || i.beer_name.toLowerCase().includes(want)))
    .map((i) => ({
      batch: i.batch_code, beer: i.beer_name, style: i.style, tank: i.tank_name, brew_day: i.brew_day,
      packed_on: i.packed_at ? i.packed_at.slice(0, 10) : null,
      litres_in_fv: i.volume_l, litres_packed: Math.round(i.packed_l),
      og_plato: i.og_plato, target_og_plato: i.target_og_plato, fg_plato: i.final_plato,
      abv: i.abv != null ? Math.round(i.abv * 10) / 10 : null, target_abv: i.target_abv,
      cartons_24x375: i.packed.c24, cartons_16x440: i.packed.c16, kegs_50: i.packed.keg50, kegs_30: i.packed.keg30, kegs_20: i.packed.keg20,
      do_brite: doRange(i.report?.bbt_do_ppb, i.report?.bbt_do_ppb_high), do_pack: doRange(i.report?.pack_do_ppb, i.report?.pack_do_ppb_high),
      hops: i.hops, yeast: i.yeast,
    }))
}
