'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/app/settings/actions'
import type { PackageFormat } from '@/types'
import { convertUnits, isAmbiguousUnit, likelyUnit } from '@/lib/costing'
import type {
  Clarity, PricedIngredient, ClarityAdditive, MaterialUsage,
  OverheadRates, CanningRates, ExciseRates, CostingResult,
} from '@/lib/costing'

// ── Price lookup ─────────────────────────────────────────────

/**
 * Resolve one price per ingredient.
 *
 * An ingredient can carry several prices — different suppliers, producers and
 * pack sizes. The rule is: use the row flagged preferred, otherwise the
 * cheapest per base unit. Taking whichever imported last is arbitrary and can
 * swing a hop between $10/kg and $540.
 */
async function resolvePrices(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ingredientIds: string[],
): Promise<Map<string, ResolvedPrice>> {
  const map = new Map<string, ResolvedPrice>()
  if (ingredientIds.length === 0) return map

  const { data } = await supabase
    .from('ingredient_prices')
    .select('ingredient_id, price_per_unit, unit, supplier, producer, is_preferred, imported_at')
    .in('ingredient_id', ingredientIds)

  type Row = {
    ingredient_id: string
    price_per_unit: number | null
    unit: string
    supplier: string
    producer: string | null
    is_preferred: boolean | null
    imported_at: string
  }

  const byIngredient = new Map<string, Row[]>()
  for (const r of (data ?? []) as Row[]) {
    const list = byIngredient.get(r.ingredient_id) ?? []
    list.push(r)
    byIngredient.set(r.ingredient_id, list)
  }

  for (const [id, rows] of byIngredient) {
    const priced = rows.filter((r) => r.price_per_unit != null)
    if (priced.length === 0) {
      const r = rows[0]
      map.set(id, {
        pricePerUnit: null, unit: r.unit, supplier: r.supplier,
        producer: r.producer, alternatives: rows.length,
      })
      continue
    }

    const preferred = priced.find((r) => r.is_preferred)
    // Compare on a common base so a $99 "each" pouch is not judged against a
    // $2.66 kg. Rows that will not normalise sort last.
    const cheapest = [...priced].sort((a, b) => {
      const an = normaliseToBase(Number(a.price_per_unit), a.unit)
      const bn = normaliseToBase(Number(b.price_per_unit), b.unit)
      if (an == null && bn == null) return 0
      if (an == null) return 1
      if (bn == null) return -1
      return an - bn
    })[0]

    const chosen = preferred ?? cheapest
    map.set(id, {
      pricePerUnit: Number(chosen.price_per_unit),
      unit: chosen.unit,
      supplier: chosen.supplier,
      producer: chosen.producer,
      alternatives: priced.length,
      isPreferred: chosen.is_preferred ?? false,
    })
  }
  return map
}

export interface ResolvedPrice {
  pricePerUnit: number | null
  unit: string
  supplier: string
  producer: string | null
  alternatives: number
  isPreferred?: boolean
}

/** Price per kg or per litre, for comparing rows priced in different units. */
function normaliseToBase(price: number, unit: string): number | null {
  const per = convertUnits(1, unit, 'kg') ?? convertUnits(1, unit, 'L')
  if (per == null || per === 0) return null
  return price / per
}

// ── Reference data for the costing screen ────────────────────

export interface RecipeOption {
  id: string
  name: string
  version: number
  style: string | null
  target_abv: number | null
  brew_volume_l: number | null
}

export async function getRecipeOptions(): Promise<RecipeOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recipes')
    .select('id, name, version, style, target_abv, brew_volume_l')
    .is('deleted_at', null)
    .order('name')
    .order('version', { ascending: false })
  return (data ?? []) as RecipeOption[]
}

export interface CostingReference {
  materials: MaterialUsage[]
  overheads: OverheadRates
  canning: CanningRates
  excise: ExciseRates
  defaultLossPct: number
  defaultClarity: Clarity
}

export async function getCostingReference(): Promise<CostingReference> {
  const supabase = await createClient()
  const [settings, { data: usage }] = await Promise.all([
    getSettings(),
    supabase
      .from('format_material_usage')
      .select('format, qty_per_unit, material_id, packaging_materials(id, name, category, price_per_unit, supplier, is_active)'),
  ])

  type UsageRow = {
    format: PackageFormat
    qty_per_unit: number
    material_id: string
    packaging_materials: { id: string; name: string; category: string; price_per_unit: number | null; supplier: string | null; is_active: boolean } | null
  }

  const materials: MaterialUsage[] = ((usage ?? []) as unknown as UsageRow[])
    .filter((u) => u.packaging_materials?.is_active)
    .map((u) => ({
      format: u.format,
      materialId: u.material_id,
      name: u.packaging_materials!.name,
      category: u.packaging_materials!.category,
      qtyPerUnit: Number(u.qty_per_unit),
      pricePerUnit: u.packaging_materials!.price_per_unit != null
        ? Number(u.packaging_materials!.price_per_unit) : null,
      supplier: u.packaging_materials!.supplier,
    }))

  return {
    materials,
    overheads: {
      labourPerBatch: Number(settings.overhead_labour_per_batch ?? 0),
      energyPerBatch: Number(settings.overhead_energy_per_batch ?? 0),
      chemicalsPerBatch: Number(settings.overhead_chemicals_per_batch ?? 0),
      waterPerBatch: Number(settings.overhead_water_per_batch ?? 0),
      otherPerL: Number(settings.overhead_other_per_l ?? 0),
    },
    canning: {
      perL: Number(settings.sa_canning_rate_per_l ?? 0.99),
      perEnd: Number(settings.sa_canning_rate_per_end ?? 0.069),
    },
    excise: {
      canStd: Number(settings.excise_rate_can_std ?? 63.75),
      kegStd: Number(settings.excise_rate_keg_std ?? 43.39),
      rtd: Number(settings.excise_rate_rtd ?? 107.99),
      kegMid: Number(settings.excise_rate_keg_mid ?? 33.11),
    },
    defaultLossPct: Number(settings.default_loss_pct ?? 10),
    defaultClarity: (settings.default_clarity ?? 'bright') as Clarity,
  }
}

// ── Recipe ingredients, priced ───────────────────────────────

export interface RecipeCostInputs {
  recipeVolumeL: number | null
  targetAbv: number | null
  ingredients: PricedIngredient[]
}

export async function getRecipeCostInputs(recipeId: string): Promise<RecipeCostInputs> {
  const supabase = await createClient()

  const [{ data: recipe }, { data: rows }] = await Promise.all([
    supabase.from('recipes').select('brew_volume_l, target_abv').eq('id', recipeId).single(),
    supabase.from('recipe_ingredients')
      .select('id, name, quantity, unit, ingredient_id, addition_stage')
      .eq('recipe_id', recipeId)
      .order('sort_order'),
  ])

  const ids = (rows ?? []).filter((r) => r.ingredient_id).map((r) => r.ingredient_id as string)
  const prices = await resolvePrices(supabase, ids)

  const ingredients: PricedIngredient[] = (rows ?? []).map((r) => {
    const p = r.ingredient_id ? prices.get(r.ingredient_id) : undefined
    return {
      recipeIngredientId: r.id,
      ingredientId: r.ingredient_id ?? null,
      name: r.name,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit: r.unit,
      pricePerUnit: p?.pricePerUnit ?? null,
      priceUnit: p?.unit ?? null,
      supplier: p ? [p.supplier, p.producer].filter(Boolean).join(' · ') : null,
    }
  })

  return {
    recipeVolumeL: recipe?.brew_volume_l != null ? Number(recipe.brew_volume_l) : null,
    targetAbv: recipe?.target_abv != null ? Number(recipe.target_abv) : null,
    ingredients,
  }
}

// ── Bright / hazy additives, priced ──────────────────────────

export async function getClarityAdditives(clarity: Clarity): Promise<ClarityAdditive[]> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('clarity_additives')
    .select('ingredient_id, qty_per_1000l, unit, ingredients(name)')
    .eq('clarity', clarity)

  type Row = {
    ingredient_id: string
    qty_per_1000l: number
    unit: string
    ingredients: { name: string } | null
  }
  const list = (rows ?? []) as unknown as Row[]
  const prices = await resolvePrices(supabase, list.map((r) => r.ingredient_id))

  return list.map((r) => {
    const p = prices.get(r.ingredient_id)
    return {
      ingredientId: r.ingredient_id,
      name: r.ingredients?.name ?? 'Unknown additive',
      qtyPer1000L: Number(r.qty_per_1000l),
      unit: r.unit,
      pricePerUnit: p?.pricePerUnit ?? null,
      priceUnit: p?.unit ?? null,
      supplier: p ? [p.supplier, p.producer].filter(Boolean).join(' · ') : null,
    }
  })
}

// ── Pre-fill from an existing brew's packaging split ─────────

export interface SplitPrefill {
  brewId: string
  beerName: string
  recipeId: string | null
  volumeIntoTankL: number | null
  lossPct: number | null
  clarity: Clarity | null
  abv: number | null
  exciseCategory: string | null
  qty: Record<PackageFormat, number>
}

export async function getSplitPrefills(): Promise<SplitPrefill[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packaging_splits')
    .select(`brew_id, clarity, volume_into_tank_l, loss_pct, abv, excise_category,
             qty_24x375, qty_16x440, qty_keg30, qty_keg50,
             brews(id, beer_name, recipe_id, volume_l)`)
    .not('brew_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(30)

  type Row = {
    brew_id: string
    clarity: Clarity | null
    volume_into_tank_l: number | null
    loss_pct: number | null
    abv: number | null
    excise_category: string | null
    qty_24x375: number; qty_16x440: number; qty_keg30: number; qty_keg50: number
    brews: { id: string; beer_name: string; recipe_id: string | null; volume_l: number | null } | null
  }

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.brews)
    .map((r) => ({
      brewId: r.brew_id,
      beerName: r.brews!.beer_name,
      recipeId: r.brews!.recipe_id,
      volumeIntoTankL: r.volume_into_tank_l != null ? Number(r.volume_into_tank_l)
        : r.brews!.volume_l != null ? Number(r.brews!.volume_l) : null,
      lossPct: r.loss_pct != null ? Number(r.loss_pct) : null,
      clarity: r.clarity,
      abv: r.abv != null ? Number(r.abv) : null,
      exciseCategory: r.excise_category,
      qty: {
        '24x375': r.qty_24x375, '16x440': r.qty_16x440,
        keg30: r.qty_keg30, keg50: r.qty_keg50,
      },
    }))
}

// ── Snapshots ────────────────────────────────────────────────

export async function saveCostSnapshot(args: {
  recipeId: string | null
  brewId: string | null
  label: string | null
  inputs: unknown
  result: CostingResult
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('batch_cost_snapshots').insert({
    recipe_id: args.recipeId,
    brew_id: args.brewId,
    label: args.label,
    costed_by: user?.email ?? null,
    inputs: args.inputs,
    result: args.result,
  })
  if (error) throw error
  revalidatePath('/costing')
}

export interface SnapshotRow {
  id: string
  label: string | null
  costed_at: string
  costed_by: string | null
  result: CostingResult
}

export async function getSnapshots(recipeId: string | null): Promise<SnapshotRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('batch_cost_snapshots')
    .select('id, label, costed_at, costed_by, result')
    .order('costed_at', { ascending: false })
    .limit(20)
  if (recipeId) q = q.eq('recipe_id', recipeId)
  const { data } = await q
  return (data ?? []) as SnapshotRow[]
}

export async function deleteSnapshot(id: string) {
  const supabase = await createClient()
  await supabase.from('batch_cost_snapshots').delete().eq('id', id)
  revalidatePath('/costing')
}

// ── Fixing gaps without leaving the costing screen ───────────

/**
 * Add a price to an ingredient and make it the one costing uses.
 * This is the fix for a "no price" line: the recipe importer creates
 * ingredient rows from recipe names, so plenty of them carry no price.
 */
export async function addIngredientPrice(args: {
  ingredientId: string
  price: number
  unit: string
  supplier: string
  producer?: string | null
}) {
  const supabase = await createClient()

  const { error } = await supabase.from('ingredient_prices').upsert({
    ingredient_id: args.ingredientId,
    supplier: args.supplier.trim() || 'Manual entry',
    producer: args.producer?.trim() ?? '',
    price_per_unit: args.price,
    unit: args.unit,
    imported_at: new Date().toISOString(),
  }, { onConflict: 'ingredient_id,supplier,producer' })
  if (error) throw error

  // A hand-entered price is a deliberate choice, so prefer it over whatever
  // else is on file for this ingredient.
  await supabase.from('ingredient_prices')
    .update({ is_preferred: false }).eq('ingredient_id', args.ingredientId)
  await supabase.from('ingredient_prices')
    .update({ is_preferred: true })
    .eq('ingredient_id', args.ingredientId)
    .eq('supplier', args.supplier.trim() || 'Manual entry')
    .eq('producer', args.producer?.trim() ?? '')

  revalidatePath('/costing')
}

/** Fix a recipe line that has no quantity, or whose unit cannot be costed. */
export async function updateRecipeLine(args: {
  recipeIngredientId: string
  quantity: number | null
  unit: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('recipe_ingredients').update({
    quantity: args.quantity,
    unit: args.unit?.trim() || null,
  }).eq('id', args.recipeIngredientId)
  if (error) throw error
  revalidatePath('/costing')
}

/** Every price on file for an ingredient, so the right one can be chosen. */
export async function getPricesForIngredient(ingredientId: string): Promise<{
  id: string; supplier: string; producer: string | null
  pricePerUnit: number | null; unit: string; isPreferred: boolean
}[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ingredient_prices')
    .select('id, supplier, producer, price_per_unit, unit, is_preferred')
    .eq('ingredient_id', ingredientId)
    .order('price_per_unit')

  return ((data ?? []) as {
    id: string; supplier: string; producer: string | null
    price_per_unit: number | null; unit: string; is_preferred: boolean | null
  }[]).map((p) => ({
    id: p.id, supplier: p.supplier, producer: p.producer,
    pricePerUnit: p.price_per_unit != null ? Number(p.price_per_unit) : null,
    unit: p.unit, isPreferred: p.is_preferred ?? false,
  }))
}

export async function choosePriceRow(ingredientId: string, priceId: string) {
  const supabase = await createClient()
  await supabase.from('ingredient_prices')
    .update({ is_preferred: false }).eq('ingredient_id', ingredientId)
  const { error } = await supabase.from('ingredient_prices')
    .update({ is_preferred: true }).eq('id', priceId)
  if (error) throw error
  revalidatePath('/costing')
}

/** Price one packaging material without leaving the costing screen. */
export async function setMaterialPrice(materialId: string, price: number, supplier?: string | null) {
  const supabase = await createClient()
  const patch: Record<string, unknown> = {
    price_per_unit: price,
    is_active: true,
    updated_at: new Date().toISOString(),
  }
  if (supplier != null && supplier.trim()) patch.supplier = supplier.trim()

  const { error } = await supabase.from('packaging_materials').update(patch).eq('id', materialId)
  if (error) throw error
  revalidatePath('/costing')
}

// ── Ambiguous units copied off a brew sheet column ──────────

export interface AmbiguousLine {
  id: string
  name: string
  quantity: number | null
  unit: string
  proposed: string
}

/**
 * Recipe lines whose unit came straight off a column heading such as "G/KG".
 * That means grams OR kilograms, so the line cannot be costed until one is
 * chosen. `proposed` is the one the magnitude points to.
 */
export async function getAmbiguousUnits(recipeId: string): Promise<AmbiguousLine[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recipe_ingredients')
    .select('id, name, quantity, unit')
    .eq('recipe_id', recipeId)
    .order('sort_order')

  return ((data ?? []) as { id: string; name: string; quantity: number | null; unit: string | null }[])
    .filter((r) => isAmbiguousUnit(r.unit))
    .map((r) => {
      const qty = r.quantity != null ? Number(r.quantity) : null
      return {
        id: r.id,
        name: r.name,
        quantity: qty,
        unit: r.unit as string,
        proposed: likelyUnit(r.unit, qty) ?? 'g',
      }
    })
}

/**
 * Resolve every ambiguous unit on a recipe. Pass a unit to force all of them,
 * or leave it out to take the proposal for each line.
 */
export async function resolveAmbiguousUnits(
  recipeId: string, force?: string,
): Promise<number> {
  const supabase = await createClient()
  const lines = await getAmbiguousUnits(recipeId)

  for (const l of lines) {
    const { error } = await supabase
      .from('recipe_ingredients')
      .update({ unit: force ?? l.proposed })
      .eq('id', l.id)
    if (error) throw error
  }

  revalidatePath('/costing')
  return lines.length
}
