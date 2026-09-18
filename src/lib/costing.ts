/**
 * Recipe costing engine — pure functions, no I/O.
 *
 * Turns a recipe plus Carla's three inputs (volume into tank, loss %,
 * bright or hazy) into a cost per can, per carton and per keg.
 *
 * Two things this deliberately does differently to the old cost-per-litre:
 *
 *  1. Losses raise the unit cost. Ingredients are bought for the volume that
 *     goes INTO the tank, but only the litres that survive reach a can. So the
 *     divisor is packaged litres, not planned volume.
 *  2. Nothing is silently costed at zero. An unpriced ingredient or material
 *     is reported as a gap and the result is marked incomplete.
 *
 * Excise is returned alongside the cost, never inside it. SSBC sits under the
 * $350k threshold on a 100% rebate, so folding it in would overstate COGS.
 */

import type { PackageFormat, ExciseCategory } from '@/types'

// ── Format metadata ──────────────────────────────────────────

export interface FormatMeta {
  format: PackageFormat
  label: string
  /** Litres of beer in one carton or one keg. */
  volumeL: number
  /** Cans per carton. Null for kegs. */
  unitsPerPack: number | null
  /** Can size in mL, drives the SA Canning fill rate. Null for kegs. */
  canMl: number | null
  isKeg: boolean
}

export const FORMAT_META: Record<PackageFormat, FormatMeta> = {
  '24x375': { format: '24x375', label: '24 × 375 mL', volumeL: 9.0,  unitsPerPack: 24, canMl: 375, isKeg: false },
  '16x440': { format: '16x440', label: '16 × 440 mL', volumeL: 7.04, unitsPerPack: 16, canMl: 440, isKeg: false },
  'keg30':  { format: 'keg30',  label: 'Keg 30 L',    volumeL: 30,   unitsPerPack: null, canMl: null, isKeg: true },
  'keg50':  { format: 'keg50',  label: 'Keg 50 L',    volumeL: 50,   unitsPerPack: null, canMl: null, isKeg: true },
}

export const FORMAT_ORDER: PackageFormat[] = ['24x375', '16x440', 'keg30', 'keg50']

export type Clarity = 'bright' | 'hazy'

export const CLARITY_LABELS: Record<Clarity, string> = {
  bright: 'Bright',
  hazy: 'Hazy',
}

// ── Unit conversion ──────────────────────────────────────────

const MASS: Record<string, number> = { mg: 1e-6, g: 1e-3, kg: 1, t: 1000 }
const VOLUME: Record<string, number> = { ml: 1e-3, l: 1, kl: 1000 }
const COUNT: Record<string, number> = { each: 1, ea: 1, unit: 1, pkg: 1, pack: 1, sachet: 1, brick: 1 }

function norm(u: string | null | undefined): string {
  return (u ?? '').toLowerCase().trim().replace(/\.$/, '')
}

/**
 * Resolve a unit string to a base-unit factor.
 *
 * Handles pack-size units as they actually appear in the imported supplier
 * lists — "500g", "100mL", "1x5kg" — not just bare "kg" and "L". A hop priced
 * per 500 g pouch resolves to 0.5 kg, so a 2.5 kg dry hop costs five pouches.
 */
function resolveUnit(u: string): { dim: 'mass' | 'volume' | 'count'; factor: number } | null {
  if (u in MASS) return { dim: 'mass', factor: MASS[u] }
  if (u in VOLUME) return { dim: 'volume', factor: VOLUME[u] }
  if (u in COUNT) return { dim: 'count', factor: COUNT[u] }

  // "500g", "100ml", "1.5kg", and multipack forms like "4x5kg"
  const m = u.match(/^(\d+(?:\.\d+)?)\s*(?:x\s*(\d+(?:\.\d+)?)\s*)?([a-z]+)$/)
  if (!m) return null
  const count = parseFloat(m[1])
  const each = m[2] != null ? parseFloat(m[2]) : 1
  const base = m[3]
  const size = m[2] != null ? count * each : count
  if (base in MASS) return { dim: 'mass', factor: size * MASS[base] }
  if (base in VOLUME) return { dim: 'volume', factor: size * VOLUME[base] }
  return null
}

/**
 * Convert a quantity between units of the same dimension.
 * Returns null when the units are not comparable — the caller must treat that
 * as a costing gap rather than assuming a 1:1 match. A compound unit such as
 * "g/kg" is not convertible because it is ambiguous, not because it is a rate:
 * brew sheets head a column "G/KG" to mean the number is in grams OR
 * kilograms, and only a human knows which.
 */
export function convertUnits(qty: number, from: string | null, to: string | null): number | null {
  const f = norm(from)
  const t = norm(to)
  if (f === t) return qty
  if (f.includes('/') || t.includes('/')) return null

  const a = resolveUnit(f)
  const b = resolveUnit(t)
  if (!a || !b || a.dim !== b.dim) return null
  return (qty * a.factor) / b.factor
}

// ── Inputs ───────────────────────────────────────────────────

export interface PricedIngredient {
  /** recipe_ingredients row, so a fix can write back to the recipe. */
  recipeIngredientId: string | null
  ingredientId: string | null
  name: string
  quantity: number | null
  unit: string | null
  /** Null when the ingredient has no price on file, or is not linked to the library. */
  pricePerUnit: number | null
  priceUnit: string | null
  supplier: string | null
}

export interface ClarityAdditive {
  ingredientId: string
  name: string
  qtyPer1000L: number
  unit: string
  pricePerUnit: number | null
  priceUnit: string | null
  supplier: string | null
}

export interface MaterialUsage {
  format: PackageFormat
  materialId: string
  name: string
  category: string
  /** Per carton for can formats, per keg for keg formats. */
  qtyPerUnit: number
  pricePerUnit: number | null
  supplier?: string | null
}

export interface OverheadRates {
  labourPerBatch: number
  energyPerBatch: number
  chemicalsPerBatch: number
  waterPerBatch: number
  otherPerL: number
}

export interface CanningRates {
  perL: number
  perEnd: number
}

export interface ExciseRates {
  canStd: number
  kegStd: number
  rtd: number
  kegMid: number
}

export type SplitQuantities = Record<PackageFormat, number>

export interface CostingInput {
  /** Volume the recipe was written for. Used to scale ingredients. */
  recipeVolumeL: number | null
  /** What Carla actually put into the tank. */
  volumeIntoTankL: number
  /** Expected loss between tank and package, as a percentage. */
  lossPct: number
  clarity: Clarity
  /** Scale recipe quantities to the tank volume. Off = use the recipe as written. */
  scaleToTank: boolean
  ingredients: PricedIngredient[]
  additives: ClarityAdditive[]
  split: SplitQuantities
  materials: MaterialUsage[]
  overheads: OverheadRates
  canning: CanningRates
  excise: ExciseRates
  abv: number | null
  exciseCategory: ExciseCategory
}

// ── Outputs ──────────────────────────────────────────────────

export type CostGap = 'not-linked' | 'no-quantity' | 'no-price' | 'unit-mismatch'

export interface CostLine {
  name: string
  detail: string
  quantity: number | null
  unit: string | null
  pricePerUnit: number | null
  priceUnit: string | null
  cost: number | null
  supplier: string | null
  /** Why this line has no cost. Null when it is priced. */
  gap: CostGap | null
  /** Set for recipe lines, so the gap can be fixed from the costing screen. */
  recipeIngredientId: string | null
  ingredientId: string | null
  /** Set for packaging material lines, for the same reason. */
  materialId?: string | null
}

export interface FormatCost {
  format: PackageFormat
  label: string
  qty: number
  volumeL: number
  /** Litres of beer across every unit of this format. */
  totalVolumeL: number
  liquidCost: number
  materialsCost: number
  materialsComplete: boolean
  canningCost: number
  overheadCost: number
  /** Cost of one carton or one keg. */
  unitCost: number
  /** Cost of one can. Null for kegs. */
  perCanCost: number | null
  /** Cost of one litre in this format, all in. */
  perLitreCost: number
  /** Excise on one unit. Reported alongside, not included in unitCost. */
  excisePerUnit: number | null
  exciseTotal: number | null
  totalCost: number
  materialLines: CostLine[]
}

export interface CostingResult {
  /** True when every ingredient and every consumed material carries a price. */
  complete: boolean
  gaps: string[]

  clarity: Clarity

  volumeIntoTankL: number
  lossPct: number
  lossL: number
  packagedVolumeL: number
  allocatedVolumeL: number
  /** Packaged minus allocated. Positive means beer the split does not account for. */
  unallocatedL: number
  /** Litres the batch cost is spread across. */
  costBasisL: number
  scaleFactor: number

  ingredientCost: number
  additiveCost: number
  liquidCost: number
  liquidCostPerL: number

  materialsCost: number
  canningCost: number
  overheadCost: number
  overheadPerL: number

  totalBatchCost: number
  totalBatchCostPerL: number

  exciseTotal: number | null

  ingredientLines: CostLine[]
  additiveLines: CostLine[]
  formats: FormatCost[]
}

// ── Engine ───────────────────────────────────────────────────

function priceLine(
  name: string,
  detail: string,
  quantity: number | null,
  unit: string | null,
  pricePerUnit: number | null,
  priceUnit: string | null,
  supplier: string | null,
  linked: boolean,
  recipeIngredientId: string | null = null,
  ingredientId: string | null = null,
): CostLine {
  let cost: number | null = null
  let gap: CostGap | null = null

  // Ordered by what has to be fixed first. A line with no quantity cannot be
  // costed even when it is priced, so say that rather than "no price".
  if (!linked) {
    gap = 'not-linked'
  } else if (quantity == null) {
    gap = 'no-quantity'
  } else if (pricePerUnit == null) {
    gap = 'no-price'
  } else {
    const converted = convertUnits(quantity, unit, priceUnit)
    if (converted == null) {
      gap = 'unit-mismatch'
    } else {
      cost = converted * pricePerUnit
    }
  }

  return {
    name, detail, quantity, unit, pricePerUnit, priceUnit, cost, supplier, gap,
    recipeIngredientId, ingredientId,
  }
}

export const GAP_LABELS: Record<CostGap, string> = {
  'not-linked': 'not linked',
  'no-quantity': 'no quantity',
  'no-price': 'no price',
  'unit-mismatch': 'unit mismatch',
}

export function calculateCosting(input: CostingInput): CostingResult {
  const {
    recipeVolumeL, volumeIntoTankL, lossPct, scaleToTank,
    ingredients, additives, split, materials,
    overheads, canning, excise, abv, exciseCategory,
  } = input

  const gaps: string[] = []

  // ── Scale the recipe to the tank ───────────────────────────
  const scaleFactor =
    scaleToTank && recipeVolumeL != null && recipeVolumeL > 0 && volumeIntoTankL > 0
      ? volumeIntoTankL / recipeVolumeL
      : 1

  // ── Liquid: recipe ingredients ─────────────────────────────
  const ingredientLines = ingredients.map((ing) => {
    const scaledQty = ing.quantity != null ? ing.quantity * scaleFactor : null
    return priceLine(
      ing.name,
      scaleFactor !== 1 && ing.quantity != null
        ? `${ing.quantity} ${ing.unit ?? ''} × ${scaleFactor.toFixed(3)}`
        : 'Recipe',
      scaledQty, ing.unit, ing.pricePerUnit, ing.priceUnit, ing.supplier,
      ing.ingredientId != null,
      ing.recipeIngredientId, ing.ingredientId,
    )
  })

  // ── Liquid: bright / hazy process additives ────────────────
  const additiveLines = additives.map((a) => {
    const qty = (a.qtyPer1000L * volumeIntoTankL) / 1000
    return priceLine(
      a.name,
      `${a.qtyPer1000L} ${a.unit}/1000 L`,
      qty, a.unit, a.pricePerUnit, a.priceUnit, a.supplier,
      true,
    )
  })

  const sum = (lines: CostLine[]) => lines.reduce((t, l) => t + (l.cost ?? 0), 0)
  const ingredientCost = sum(ingredientLines)
  const additiveCost = sum(additiveLines)
  const liquidCost = ingredientCost + additiveCost

  for (const l of [...ingredientLines, ...additiveLines]) {
    if (l.gap === 'not-linked') gaps.push(`${l.name} is not linked to the ingredient library`)
    else if (l.gap === 'no-quantity') gaps.push(`${l.name} has no quantity in the recipe`)
    else if (l.gap === 'no-price') gaps.push(`${l.name} has no price on file`)
    else if (l.gap === 'unit-mismatch') gaps.push(`${l.name} is in ${l.unit ?? '?'} but priced per ${l.priceUnit ?? '?'}`)
  }

  // ── Volumes ────────────────────────────────────────────────
  const lossL = volumeIntoTankL * (lossPct / 100)
  const packagedVolumeL = Math.max(0, volumeIntoTankL - lossL)

  const allocatedVolumeL = FORMAT_ORDER.reduce(
    (t, f) => t + (split[f] ?? 0) * FORMAT_META[f].volumeL, 0)
  const unallocatedL = packagedVolumeL - allocatedVolumeL

  // Spread the batch cost across the units actually produced. If the split
  // leaves beer unaccounted for, that cost still lands on what was packaged.
  const costBasisL = allocatedVolumeL > 0 ? allocatedVolumeL : packagedVolumeL
  const liquidCostPerL = costBasisL > 0 ? liquidCost / costBasisL : 0

  // ── Overheads ──────────────────────────────────────────────
  const overheadCost =
    overheads.labourPerBatch + overheads.energyPerBatch +
    overheads.chemicalsPerBatch + overheads.waterPerBatch +
    overheads.otherPerL * volumeIntoTankL
  const overheadPerL = costBasisL > 0 ? overheadCost / costBasisL : 0

  // ── Per-format costs ───────────────────────────────────────
  const hasAbv = abv != null && abv > 0

  const formats: FormatCost[] = FORMAT_ORDER.map((format) => {
    const meta = FORMAT_META[format]
    const qty = split[format] ?? 0

    const materialLines: CostLine[] = materials
      .filter((m) => m.format === format)
      .map((m) => ({
        ...priceLine(
          m.name, `${m.qtyPerUnit} per ${meta.isKeg ? 'keg' : 'carton'}`,
          m.qtyPerUnit, 'each', m.pricePerUnit, 'each', m.supplier ?? null, true,
        ),
        materialId: m.materialId,
      }))

    const materialsCost = sum(materialLines)
    const materialsComplete = materialLines.every((l) => l.gap == null)

    if (qty > 0) {
      for (const l of materialLines) {
        if (l.gap != null) gaps.push(`${l.name} (${meta.label}) has no price on file`)
      }
    }

    const canningCost = !meta.isKeg && meta.unitsPerPack && meta.canMl
      ? meta.unitsPerPack * ((meta.canMl / 1000) * canning.perL + canning.perEnd)
      : 0

    const liquid = meta.volumeL * liquidCostPerL
    const overhead = meta.volumeL * overheadPerL
    const unitCost = liquid + materialsCost + canningCost + overhead

    const rate = meta.isKeg
      ? (exciseCategory === 'mid_strength' ? excise.kegMid : excise.kegStd)
      : (exciseCategory === 'rtd' ? excise.rtd : excise.canStd)
    const excisePerUnit = hasAbv ? meta.volumeL * (abv! / 100) * rate : null

    return {
      format,
      label: meta.label,
      qty,
      volumeL: meta.volumeL,
      totalVolumeL: qty * meta.volumeL,
      liquidCost: liquid,
      materialsCost,
      materialsComplete,
      canningCost,
      overheadCost: overhead,
      unitCost,
      perCanCost: meta.unitsPerPack ? unitCost / meta.unitsPerPack : null,
      perLitreCost: meta.volumeL > 0 ? unitCost / meta.volumeL : 0,
      excisePerUnit,
      exciseTotal: excisePerUnit != null ? excisePerUnit * qty : null,
      totalCost: unitCost * qty,
      materialLines,
    }
  })

  const materialsCost = formats.reduce((t, f) => t + f.materialsCost * f.qty, 0)
  const canningCost = formats.reduce((t, f) => t + f.canningCost * f.qty, 0)
  const totalBatchCost = liquidCost + materialsCost + canningCost + overheadCost
  const exciseTotal = hasAbv ? formats.reduce((t, f) => t + (f.exciseTotal ?? 0), 0) : null

  if (!hasAbv) gaps.push('ABV not set, so excise cannot be calculated')

  return {
    complete: gaps.length === 0,
    gaps: Array.from(new Set(gaps)),

    clarity: input.clarity,

    volumeIntoTankL,
    lossPct,
    lossL,
    packagedVolumeL,
    allocatedVolumeL,
    unallocatedL,
    costBasisL,
    scaleFactor,

    ingredientCost,
    additiveCost,
    liquidCost,
    liquidCostPerL,

    materialsCost,
    canningCost,
    overheadCost,
    overheadPerL,

    totalBatchCost,
    totalBatchCostPerL: costBasisL > 0 ? totalBatchCost / costBasisL : 0,

    exciseTotal,

    ingredientLines,
    additiveLines,
    formats,
  }
}

/**
 * Fill a split from the packaged volume, largest format first.
 * Gives Carla a starting point she can then adjust.
 */
export function suggestSplit(packagedVolumeL: number, kegShare = 0.5): SplitQuantities {
  const kegL = packagedVolumeL * kegShare
  const canL = packagedVolumeL - kegL
  const keg50 = Math.floor(kegL / 50)
  const keg30 = Math.floor((kegL - keg50 * 50) / 30)
  const qty24 = Math.floor(canL / FORMAT_META['24x375'].volumeL)
  return { '24x375': qty24, '16x440': 0, keg30, keg50 }
}

export const EMPTY_SPLIT: SplitQuantities = { '24x375': 0, '16x440': 0, keg30: 0, keg50: 0 }

/**
 * A unit copied straight off a brew sheet column heading, such as "g/kg" or
 * "mL/L". It means the number is in one unit or the other, so it cannot be
 * costed until someone says which.
 */
export function isAmbiguousUnit(unit: string | null | undefined): boolean {
  return !!unit && unit.includes('/')
}

/**
 * The two units an ambiguous one could mean, smaller first.
 * "g/kg" gives ['g', 'kg'].
 */
export function ambiguousOptions(unit: string | null | undefined): [string, string] | null {
  if (!isAmbiguousUnit(unit)) return null
  const parts = unit!.split('/').map((p) => p.trim()).filter(Boolean)
  if (parts.length !== 2) return null
  return [parts[0], parts[1]]
}

/**
 * Which of the two an amount is most likely to be, judged on magnitude.
 * Kettle additions, finings and salts are dosed in grams, so 170 is grams and
 * not 170 kg. Anything in the hundreds of the larger unit is implausible for a
 * single addition.
 */
export function likelyUnit(unit: string | null | undefined, quantity: number | null): string | null {
  const opts = ambiguousOptions(unit)
  if (!opts) return null
  const [small, large] = opts
  if (quantity == null) return small
  // Over ~10 of the larger unit stops being credible for a single addition.
  return quantity > 10 ? small : large
}

export function formatMoney(n: number | null | undefined, dp = 2): string {
  if (n == null || !isFinite(n)) return '—'
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
}
