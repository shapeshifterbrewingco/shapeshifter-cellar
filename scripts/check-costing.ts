/**
 * End-to-end smoke test of the costing engine against live data.
 * Read-only. Links confident matches in memory only, nothing is written.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { findCandidates, isConfidentMatch } from '../src/lib/matching'
import type { LibraryEntry } from '../src/lib/matching'
import { calculateCosting, formatMoney, FORMAT_META } from '../src/lib/costing'
import type { PricedIngredient, MaterialUsage, SplitQuantities } from '../src/lib/costing'

config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const RECIPE = process.argv[2] ?? 'Golden Ratio'
const VOLUME = Number(process.argv[3] ?? 2000)
const LOSS = Number(process.argv[4] ?? 10)

async function main() {
  const { data: ing } = await db.from('ingredients')
    .select('id, name, category, ingredient_prices(price_per_unit, unit, supplier, producer, is_preferred)')
    .is('deleted_at', null)

  const library: LibraryEntry[] = (ing ?? []).map((i: any) => {
    const prices = (i.ingredient_prices ?? []).filter((p: any) => p.price_per_unit != null)
    const chosen = prices.find((p: any) => p.is_preferred) ?? prices[0]
    return {
      id: i.id, name: i.name, category: i.category,
      producer: chosen?.producer ?? null, supplier: chosen?.supplier ?? null,
      pricePerUnit: chosen?.price_per_unit != null ? Number(chosen.price_per_unit) : null,
      unit: chosen?.unit ?? null,
    }
  })
  const priced = library.filter((l) => l.pricePerUnit != null)

  const { data: recipe } = await db.from('recipes')
    .select('id, name, brew_volume_l, target_abv').eq('name', RECIPE).is('deleted_at', null).single()
  if (!recipe) throw new Error(`No recipe named ${RECIPE}`)

  const { data: rows } = await db.from('recipe_ingredients')
    .select('name, category, quantity, unit').eq('recipe_id', recipe.id).order('sort_order')

  const ingredients: PricedIngredient[] = (rows ?? []).map((r: any) => {
    const cands = findCandidates(r.name, r.category, priced)
    const pick = isConfidentMatch(cands) ? cands[0] : null
    return {
      ingredientId: pick?.id ?? null,
      name: r.name,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit: r.unit,
      pricePerUnit: pick?.pricePerUnit ?? null,
      priceUnit: pick?.unit ?? null,
      supplier: pick?.supplier ?? null,
    }
  })

  const { data: usage } = await db.from('format_material_usage')
    .select('format, qty_per_unit, material_id, packaging_materials(name, category, price_per_unit, is_active)')

  const materials: MaterialUsage[] = (usage ?? [])
    .filter((u: any) => u.packaging_materials?.is_active)
    .map((u: any) => ({
      format: u.format, materialId: u.material_id,
      name: u.packaging_materials.name, category: u.packaging_materials.category,
      qtyPerUnit: Number(u.qty_per_unit),
      pricePerUnit: u.packaging_materials.price_per_unit != null
        ? Number(u.packaging_materials.price_per_unit) : null,
    }))

  // Fill the split from the packaged volume: half cans, half kegs.
  const packaged = VOLUME * (1 - LOSS / 100)
  const kegL = packaged / 2
  const keg50 = Math.floor(kegL / 50)
  const split: SplitQuantities = {
    '24x375': Math.floor((packaged - keg50 * 50) / 9),
    '16x440': 0, keg30: 0, keg50,
  }

  const result = calculateCosting({
    recipeVolumeL: recipe.brew_volume_l != null ? Number(recipe.brew_volume_l) : null,
    volumeIntoTankL: VOLUME, lossPct: LOSS, clarity: 'bright', scaleToTank: true,
    ingredients, additives: [], split, materials,
    overheads: { labourPerBatch: 0, energyPerBatch: 0, chemicalsPerBatch: 0, waterPerBatch: 0, otherPerL: 0 },
    canning: { perL: 0.99, perEnd: 0.069 },
    excise: { canStd: 63.75, kegStd: 43.39, rtd: 107.99, kegMid: 33.11 },
    abv: recipe.target_abv != null ? Number(recipe.target_abv) : null,
    exciseCategory: 'standard',
  })

  console.log(`\n=== ${recipe.name} — ${VOLUME} L into tank, ${LOSS}% loss ===`)
  console.log(`Recipe written for ${recipe.brew_volume_l} L, scale factor ${result.scaleFactor.toFixed(3)}`)
  console.log(`Packaged ${result.packagedVolumeL.toFixed(0)} L, allocated ${result.allocatedVolumeL.toFixed(0)} L`)
  console.log(`Split: ${split['24x375']} × 24pk, ${split.keg50} × 50L\n`)

  console.log('Ingredients:')
  for (const l of result.ingredientLines) {
    const cost = l.cost != null ? formatMoney(l.cost).padStart(10) : `  ${(l.gap ?? '').padEnd(8)}`
    const price = l.pricePerUnit != null ? `@ ${formatMoney(l.pricePerUnit)}/${l.priceUnit}` : ''
    console.log(`  ${l.name.padEnd(34)} ${String(l.quantity?.toFixed(2) ?? '—').padStart(9)} ${(l.unit ?? '').padEnd(5)} ${cost}  ${price}`)
  }

  console.log(`\nIngredient cost   ${formatMoney(result.ingredientCost).padStart(12)}`)
  console.log(`Materials         ${formatMoney(result.materialsCost).padStart(12)}`)
  console.log(`Contract canning  ${formatMoney(result.canningCost).padStart(12)}`)
  console.log(`Overheads         ${formatMoney(result.overheadCost).padStart(12)}`)
  console.log(`TOTAL BATCH       ${formatMoney(result.totalBatchCost).padStart(12)}`)
  console.log(`Per packaged L    ${formatMoney(result.totalBatchCostPerL, 3).padStart(12)}`)

  console.log('\nPer unit:')
  for (const f of result.formats.filter((x) => x.qty > 0)) {
    const per = f.perCanCost != null ? `  ${formatMoney(f.perCanCost)}/can` : ''
    console.log(`  ${f.label.padEnd(14)} ${formatMoney(f.unitCost).padStart(9)} per ${FORMAT_META[f.format].isKeg ? 'keg ' : 'ctn '}${per}   excise ${formatMoney(f.excisePerUnit)}`)
  }

  console.log(`\nGaps (${result.gaps.length}):`)
  for (const g of result.gaps) console.log(`  - ${g}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
