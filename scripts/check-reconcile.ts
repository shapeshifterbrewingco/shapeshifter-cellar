/**
 * Reconcile the engine against Carla's Fifth Element sheet (Costs tab).
 * Feeds the sheet's own inputs through calculateCosting and compares.
 * Read-only.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { calculateCosting, formatMoney } from '../src/lib/costing'
import type { MaterialUsage, SplitQuantities, PricedIngredient } from '../src/lib/costing'

config({ path: '.env.local' })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Straight from the sheet
const VOLUME_FV = 1150
const LOSS_PCT = 15
const LABOUR = 1426
const INGREDIENTS_TOTAL = 2100.67   // sheet total $3,526.67 less labour
const SHEET_CARTON = 61.09
const SHEET_KEG50 = 235.39
const SHEET_KEG30 = 163.24

async function main() {
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

  // One synthetic line carrying the sheet's ingredient total, so the
  // comparison isolates the packaging and allocation maths.
  const ingredients: PricedIngredient[] = [{
    ingredientId: 'sheet', name: 'Ingredients (from sheet)',
    quantity: 1, unit: 'each',
    pricePerUnit: INGREDIENTS_TOTAL, priceUnit: 'each', supplier: 'sheet',
  }]

  // The sheet's own split: 5 x 30L, 5 x 50L, 75.09 cartons of 16x440
  const split: SplitQuantities = { '24x375': 0, '16x440': 75, keg30: 5, keg50: 5 }

  const result = calculateCosting({
    recipeVolumeL: null, volumeIntoTankL: VOLUME_FV, lossPct: LOSS_PCT,
    clarity: 'hazy', scaleToTank: false,
    ingredients, additives: [], split, materials,
    overheads: { labourPerBatch: LABOUR, energyPerBatch: 0, chemicalsPerBatch: 0, waterPerBatch: 0, otherPerL: 0 },
    canning: { perL: 0.99, perEnd: 0.069 },
    excise: { canStd: 63.75, kegStd: 43.39, rtd: 107.99, kegMid: 33.11 },
    abv: 7.5, exciseCategory: 'standard',
  })

  const carton = result.formats.find((f) => f.format === '16x440')!
  const keg50 = result.formats.find((f) => f.format === 'keg50')!
  const keg30 = result.formats.find((f) => f.format === 'keg30')!

  console.log(`\n=== Fifth Element reconciliation ===`)
  console.log(`FV ${VOLUME_FV} L, ${LOSS_PCT}% loss -> packaged ${result.packagedVolumeL.toFixed(1)} L`)
  console.log(`Split allocates ${result.allocatedVolumeL.toFixed(1)} L (sheet packs 928.6 L)`)
  console.log(`Cost basis ${result.costBasisL.toFixed(1)} L\n`)

  console.log(`Beer $/L      engine ${formatMoney(result.liquidCostPerL + result.overheadPerL, 3)}   sheet $3.610`)
  console.log(`Materials/ctn engine ${formatMoney(carton.materialsCost)}   sheet $27.74`)
  console.log(`Canning/ctn   engine ${formatMoney(carton.canningCost)}   sheet $7.96\n`)

  const cmp = (label: string, mine: number, sheet: number) => {
    const d = mine - sheet
    const pct = (d / sheet) * 100
    console.log(`${label.padEnd(16)} engine ${formatMoney(mine).padStart(9)}   sheet ${formatMoney(sheet).padStart(9)}   diff ${(d >= 0 ? '+' : '') + d.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`)
  }
  cmp('16x440 carton', carton.unitCost, SHEET_CARTON)
  cmp('50L keg', keg50.unitCost, SHEET_KEG50)
  cmp('30L keg', keg30.unitCost, SHEET_KEG30)

  console.log(`\nPer can: ${formatMoney(carton.perCanCost)}  (sheet $${(SHEET_CARTON / 16).toFixed(2)})`)
  console.log(`\nRemaining gaps (${result.gaps.length}):`)
  for (const g of result.gaps) console.log(`  - ${g}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
