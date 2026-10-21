'use server'

import { isOwnerEmail } from '@/lib/auth-domain'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getFrigidReadings } from '@/lib/frigid'
import { addPackedStock } from '@/lib/sales-stock'
import { after } from 'next/server'
import { coolingOff } from '@/lib/cooling'
import { writeSplitVolume } from '@/lib/tank-splits'
import { logActivity, who, esc, logGroupedActivity } from '@/lib/slack'
import { publishPackReportLater } from '@/lib/pack-report-post'
import { all } from '@/lib/history'
import { STAGE_LABELS } from '@/types'
import type { TankStage, PackageFormat, HopLoad, ExciseCategory, PackagingSplit } from '@/types'

// Actions that move a brew return a result instead of throwing: Next strips
// error messages in production, so a thrown error reaches the brewer as a
// generic crash screen with no reason on it.
export type ActionResult = { ok: true; note?: string; id?: string } | { ok: false; message: string }

const fail = (message: string): ActionResult => ({ ok: false, message })

type Db = Awaited<ReturnType<typeof createClient>>

const LIVE_STAGES_FILTER = '(empty,transferred,packaged)'

/** The live brew in a tank, if any. A tank holds one beer at a time. */
async function brewInTank(supabase: Db, tankId: string, exceptBrewId?: string) {
  let q = supabase
    .from('brews')
    .select('id, beer_name')
    .eq('tank_id', tankId)
    .is('deleted_at', null)
    .not('stage', 'in', LIVE_STAGES_FILTER)
  if (exceptBrewId) q = q.neq('id', exceptBrewId)
  const { data } = await q.limit(1).maybeSingle()
  return data
}

async function tankName(supabase: Db, tankId: string): Promise<string> {
  const { data } = await supabase.from('tanks').select('name').eq('id', tankId).maybeSingle()
  return data?.name ?? 'a tank'
}

async function batchCodeTaken(supabase: Db, batchCode: string, exceptBrewId: string) {
  const { data } = await supabase
    .from('brews')
    .select('id, beer_name')
    .eq('batch_code', batchCode)
    .neq('id', exceptBrewId)
    .limit(1)
    .maybeSingle()
  return data
}

// ── Assign ────────────────────────────────────────────────────

export async function assignBrew(data: {
  tank_id: string
  recipe_id: string | null
  beer_name: string
  style: string | null
  brew_day: string
  volume_l: number
  og_plato: number | null
  initial_ph: number | null
  notes: string
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  if (!data.beer_name.trim()) return fail('Give the brew a name.')
  if (!(data.volume_l > 0)) return fail('Volume must be more than zero.')
  // OG and pH are not known when a brew day starts. They are entered on the
  // brew sheet under "All in FV", and the tank card says so until they are.

  const occupant = await brewInTank(supabase, data.tank_id)
  if (occupant) return fail(`That tank already holds ${occupant.beer_name}. Refresh the page.`)

  // Keep the target on the batch, so changing the recipe later does not rewrite what this one aimed for
  const { data: recipe } = data.recipe_id
    ? await supabase.from('recipes').select('target_abv, target_og_plato').eq('id', data.recipe_id).maybeSingle()
    : { data: null }

  const { data: brew, error } = await supabase.from('brews').insert({
    tank_id: data.tank_id,
    recipe_id: data.recipe_id || null,
    target_abv: recipe?.target_abv ?? null,
    target_og_plato: recipe?.target_og_plato ?? null,
    beer_name: data.beer_name.trim(),
    style: data.style || null,
    brew_day: data.brew_day,
    volume_l: data.volume_l,
    og_plato: data.og_plato,
    stage: 'active_ferment',
    notes: data.notes.trim() || null,
  }).select('id').single()
  if (error || !brew) return fail(`Could not save the brew: ${error?.message ?? 'no row returned'}`)

  if (data.og_plato != null || data.initial_ph != null) {
    const { error: readingError } = await supabase.from('gravity_readings').insert({
      brew_id: brew.id,
      tank_id: data.tank_id,
      plato: data.og_plato,
      ph: data.initial_ph,
      recorded_by: user.email ?? user.id,
      notes: 'Initial reading',
    })
    if (readingError) console.error('[assignBrew] initial reading failed:', readingError.message)
  }

  // Auto-link any pre-planned packaging split from a scheduled pack event for this tank
  const { data: packEvent } = await supabase
    .from('scheduled_brews')
    .select('id')
    .eq('tank_id', data.tank_id)
    .eq('event_type', 'pack')
    .not('status', 'in', '(done,cancelled)')
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (packEvent) {
    await supabase
      .from('packaging_splits')
      .update({ brew_id: brew.id })
      .eq('scheduled_brew_id', packEvent.id)
      .is('brew_id', null)
  }

  logActivity(`${who(user.email)} started a brew day: *${esc(data.beer_name.trim())}* into ${await tankName(supabase, data.tank_id)}, ${data.volume_l} L planned${data.og_plato != null ? `, OG ${data.og_plato}°P` : ''}.`)

  revalidatePath('/')
  return { ok: true, id: brew.id }
}

// ── Log reading ───────────────────────────────────────────────

/**
 * The tank's temperature right now, straight from its Frigid probe, so nobody
 * has to read it off the panel and type it in. Null if the tank has no probe
 * or Frigid does not answer: a reading is never refused for want of it.
 */
async function liveTankTemp(supabase: Db, tankId: string): Promise<number | null> {
  try {
    const [{ data: tank }, readings] = await Promise.all([
      supabase.from('tanks').select('frigid_tank_name').eq('id', tankId).maybeSingle(),
      getFrigidReadings(),
    ])
    const probe = readings.find((r) => r.name === tank?.frigid_tank_name)
    return probe?.temperature != null ? Math.round(probe.temperature * 10) / 10 : null
  } catch {
    return null
  }
}

// 0.0 is a real reading (hard lemonade finishes there), so only drop blanks and NaN
const num = (v: number | null | undefined) => (typeof v === 'number' && !Number.isNaN(v) ? v : null)

export async function logGravityReading(data: {
  brew_id: string
  tank_id: string
  plato: number | null
  ph: number | null
  notes: string
  recorded_by: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('gravity_readings').insert({
    brew_id: data.brew_id,
    tank_id: data.tank_id,
    plato: num(data.plato),
    ph: num(data.ph),
    temperature_c: await liveTankTemp(supabase, data.tank_id),
    notes: data.notes.trim() || null,
    recorded_by: data.recorded_by,
  })
  if (error) throw error
  revalidatePath('/')
}

/** The phone quick-log: gravity and pH in one tap. Time, user and tank temperature are stamped here. */
export async function quickLogReading(data: {
  brew_id: string
  tank_id: string
  plato: number | null
  ph: number | null
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  const plato = num(data.plato), ph = num(data.ph)
  if (plato == null && ph == null) return fail('Enter a gravity or a pH.')
  if (plato != null && (plato < -5 || plato > 40)) return fail(`Gravity of ${plato}°P does not look right.`)
  if (ph != null && (ph < 0 || ph > 14)) return fail(`pH of ${ph} does not look right.`)

  // The tank on screen may have been emptied or refilled since the page loaded
  const { data: brew } = await supabase
    .from('brews').select('id').eq('id', data.brew_id).eq('tank_id', data.tank_id).is('deleted_at', null).maybeSingle()
  if (!brew) return fail('That tank has changed since the page loaded. Refresh and try again.')

  const { error } = await supabase.from('gravity_readings').insert({
    brew_id: data.brew_id,
    tank_id: data.tank_id,
    plato, ph,
    temperature_c: await liveTankTemp(supabase, data.tank_id),
    recorded_by: user.email ?? user.id,
  })
  if (error) return fail(`Not saved: ${error.message}`)

  revalidatePath('/')
  revalidatePath('/readings')
  return { ok: true }
}

// ── Stage change ──────────────────────────────────────────────

export async function updateBrewStage(brew_id: string, tank_id: string, stage: TankStage) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('brews')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', brew_id)
  if (error) throw error

  const { error: noteError } = await supabase.from('gravity_readings').insert({
    brew_id,
    tank_id,
    plato: null,
    ph: null,
    recorded_by: user.email ?? user.id,
    notes: `→ ${STAGE_LABELS[stage]}`,
  })
  if (noteError) console.error('[updateBrewStage] stage note failed:', noteError.message)

  const { data: moved } = await supabase.from('brews').select('beer_name').eq('id', brew_id).maybeSingle()
  logGroupedActivity(
    `${tank_id}:${user.email ?? user.id}`,
    `${who(user.email)} moved ${await tankName(supabase, tank_id)}${moved?.beer_name ? ` (${esc(moved.beer_name)})` : ''} to *${STAGE_LABELS[stage]}*.`,
    `moved it to *${STAGE_LABELS[stage]}*`,
  )

  revalidatePath('/')
}

// ── Transfer ──────────────────────────────────────────────────

export async function transferBrew(data: {
  brew_id: string
  source_tank_id: string
  dest_tank_id: string
  /** What arrived in the destination, measured at the end. Left out, the brew keeps its volume. */
  volume_out_l?: number | null
  batch_code: string | null
  notes: string
  // Transfer report fields
  brite_cooling_on?: boolean
  fv_temp_pre_c?: number | null
  brite_temp_pre_c?: number | null
  purge_start?: string | null
  purge_finish?: string | null
  transfer_start?: string | null
  transfer_finish?: string | null
  brite_temp_post_c?: number | null
  brite_pressure_psi?: number | null
  initial_carb_performed?: boolean
  fv_cooling_off?: boolean
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  if (data.source_tank_id === data.dest_tank_id) return fail('Pick a different tank to transfer into.')

  const { data: before } = await supabase
    .from('brews')
    .select('tank_id, volume_l, stage, batch_code')
    .eq('id', data.brew_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!before) return fail('That brew is no longer in a tank. Refresh the page.')
  if (before.tank_id !== data.source_tank_id) return fail('That brew has already been moved. Refresh the page.')

  const occupant = await brewInTank(supabase, data.dest_tank_id, data.brew_id)
  if (occupant) return fail(`The destination tank already holds ${occupant.beer_name}.`)

  // What arrives is only known once the transfer is over. If it was measured it
  // is used; if not, the brew carries its volume across to be corrected later.
  const volumeIn = Number(before.volume_l)
  if (data.volume_out_l != null && !(data.volume_out_l > 0 && data.volume_out_l < 20000)) return fail('The brite volume must be more than zero.')
  const volume = data.volume_out_l ?? volumeIn

  const batchCode = data.batch_code?.trim() || null
  if (batchCode) {
    const clash = await batchCodeTaken(supabase, batchCode, data.brew_id)
    if (clash) return fail(`Batch code ${batchCode} is already used by ${clash.beer_name}.`)
  }

  // Move the brew first: it is the write that can be refused. If the transfer
  // record then fails, the move is undone so the two never disagree.
  const { error: moveError } = await supabase.from('brews').update({
    tank_id: data.dest_tank_id,
    volume_l: volume,
    stage: 'on_chill',
    batch_code: batchCode,
    updated_at: new Date().toISOString(),
  }).eq('id', data.brew_id)
  if (moveError) return fail(`Could not move the brew: ${moveError.message}`)

  const { error: transferError } = await supabase.from('transfers').insert({
    brew_id: data.brew_id,
    source_tank_id: data.source_tank_id,
    dest_tank_id: data.dest_tank_id,
    volume_in_l: volumeIn,
    volume_out_l: volume,
    transferred_by: user.email ?? user.id,
    notes: data.notes.trim() || null,
    brite_cooling_on: data.brite_cooling_on ?? null,
    fv_temp_pre_c: data.fv_temp_pre_c ?? null,
    brite_temp_pre_c: data.brite_temp_pre_c ?? null,
    purge_start: data.purge_start || null,
    purge_finish: data.purge_finish || null,
    transfer_start: data.transfer_start || null,
    transfer_finish: data.transfer_finish || null,
    brite_temp_post_c: data.brite_temp_post_c ?? null,
    brite_pressure_psi: data.brite_pressure_psi ?? null,
    initial_carb_performed: data.initial_carb_performed ?? null,
    fv_cooling_off: data.fv_cooling_off ?? null,
  })
  if (transferError) {
    await supabase.from('brews').update({
      tank_id: before.tank_id,
      volume_l: before.volume_l,
      stage: before.stage,
      batch_code: before.batch_code,
      updated_at: new Date().toISOString(),
    }).eq('id', data.brew_id)
    return fail(`Could not record the transfer, so nothing was moved: ${transferError.message}`)
  }

  const { error: noteError } = await supabase.from('gravity_readings').insert({
    brew_id: data.brew_id,
    tank_id: data.dest_tank_id,
    plato: null,
    ph: null,
    recorded_by: user.email ?? user.id,
    notes: data.volume_out_l != null ? `→ Transferred (${volume} L arrived, ${volumeIn} L in the fermenter)` : `→ Transferred (${volumeIn} L in the fermenter, arrival not measured)`,
  })
  if (noteError) console.error('[transferBrew] transfer note failed:', noteError.message)

  {
    const [{ data: b }, from, to] = await Promise.all([
      supabase.from('brews').select('beer_name').eq('id', data.brew_id).maybeSingle(),
      tankName(supabase, data.source_tank_id),
      tankName(supabase, data.dest_tank_id),
    ])
    // The fermenter it left is empty: stop holding it cold
    await coolingOff(data.source_tank_id)
    if (data.volume_out_l != null) after(() => writeSplitVolume(data.brew_id).then(() => undefined))
    logActivity(`${who(user.email)} transferred *${esc(b?.beer_name ?? 'a beer')}* from ${from} to ${to}${data.volume_out_l != null ? `: ${volume} L arrived${volumeIn - volume > 0 ? ` (${Math.round(volumeIn - volume)} L lost)` : ''}` : ''}.`)
  }

  revalidatePath('/')
  return { ok: true }
}

// ── Package ───────────────────────────────────────────────────

export async function packageBrew(data: {
  brew_id: string
  tank_id: string
  packages: { format: PackageFormat; qty: number; volume_l: number }[]
  notes: string
  batch_code: string
  // Packaging QC readings
  best_before_date?: string | null
  bbt_temp_c?: number | null
  bbt_co2_vol?: number | null
  bbt_do_ppb?: number | null
  bbt_do_ppb_high?: number | null
  can_co2_vol?: number | null
  can_do_ppb?: number | null
  can_do_ppb_high?: number | null
  unders_sor?: string | null
  // Stock distribution
  stock_venue_kegs?: number | null
  stock_venue_cartons?: number | null
  stock_options_kegs?: number | null
  stock_options_cartons?: number | null
  stock_sales_kegs?: number | null
  stock_sales_cartons?: number | null
}): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  const packages = data.packages.filter(p => p.qty > 0)
  const batchCode = data.batch_code.trim()
  if (packages.length === 0) return fail('Enter a quantity for at least one format.')
  if (!batchCode) return fail('Enter a batch code.')

  const { data: before } = await supabase
    .from('brews')
    .select('stage, batch_code')
    .eq('id', data.brew_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!before) return fail('That brew has already been packaged. Refresh the page.')

  const clash = await batchCodeTaken(supabase, batchCode, data.brew_id)
  if (clash) return fail(`Batch code ${batchCode} is already used by ${clash.beer_name}.`)

  const now = new Date().toISOString()

  // Close the brew first: it is the write that can be refused, and doing it
  // first means a second tap finds nothing left to package. If the runs then
  // fail, the brew is reopened so a retry cannot double up the packaged litres.
  const { error: closeError } = await supabase.from('brews').update({
    stage: 'packaged',
    batch_code: batchCode,
    deleted_at: now,
    updated_at: now,
  }).eq('id', data.brew_id)
  if (closeError) return fail(`Could not close the brew: ${closeError.message}`)

  const { error: runsError } = await supabase.from('packaging_runs').insert(
    packages.map(pkg => ({
      brew_id: data.brew_id,
      tank_id: data.tank_id,
      packaged_by: user.email ?? user.id,
      packaged_at: now,
      format: pkg.format,
      qty: pkg.qty,
      volume_l: pkg.volume_l,
      notes: data.notes.trim() || null,
    }))
  )
  if (runsError) {
    await supabase.from('brews').update({
      stage: before.stage,
      batch_code: before.batch_code,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', data.brew_id)
    return fail(`Could not record the packaging run, so the brew is still in tank: ${runsError.message}`)
  }

  // The tank is empty now, so it stops being held cold
  await coolingOff(data.tank_id)

  // Into Sales App stock, so nobody has to add it there by hand
  let stockNote = ''
  {
    const { data: b } = await supabase.from('brews').select('beer_name, style').eq('id', data.brew_id).maybeSingle()
    const total = packages.reduce((sum, p) => sum + p.volume_l, 0)
    const parts = packages.map((p) => `${p.qty} x ${p.format}`).join(', ')
    const stock = b?.beer_name ? await addPackedStock(b.beer_name, b.style ?? null, batchCode, packages) : { added: [], missed: ['the beer name could not be read'] }
    stockNote = [
      stock.added.length ? `Added to Sales App stock: ${stock.added.join(', ')}.` : '',
      stock.missed.length ? `Not added to Sales App stock (${stock.missed.join('; ')}). Add it there by hand.` : '',
    ].filter(Boolean).join(' ')
    logActivity(`${who(user.email)} packaged *${esc(b?.beer_name ?? 'a beer')}* (batch ${esc(batchCode)}) from ${await tankName(supabase, data.tank_id)}: ${parts}. ${Math.round(total)} L in total. ${esc(stockNote)}`.trim())
  }

  // The report in #packagingreports. Runs after the response, by which time the
  // QC and stock figures below are saved too.
  publishPackReportLater(data.brew_id, { create: true, actor: user.email })

  // QC readings and stock distribution are the packaging report, the same one
  // History shows and edits.
  const qc = {
    best_before: data.best_before_date || null,
    bbt_temp_c: data.bbt_temp_c ?? null,
    bbt_co2_vol: data.bbt_co2_vol ?? null,
    bbt_do_ppb: data.bbt_do_ppb ?? null,
    bbt_do_ppb_high: data.bbt_do_ppb_high ?? null,
    pack_co2_vol: data.can_co2_vol ?? null,
    pack_do_ppb: data.can_do_ppb ?? null,
    pack_do_ppb_high: data.can_do_ppb_high ?? null,
    unders: data.unders_sor || null,
    stock_venue_kegs: data.stock_venue_kegs ?? null,
    stock_venue_cartons: data.stock_venue_cartons ?? null,
    stock_options_kegs: data.stock_options_kegs ?? null,
    stock_options_cartons: data.stock_options_cartons ?? null,
    stock_sales_kegs: data.stock_sales_kegs ?? null,
    stock_sales_cartons: data.stock_sales_cartons ?? null,
  }
  if (Object.values(qc).some(v => v != null)) {
    const { error: qcError } = await supabase
      .from('packaging_reports')
      .upsert({ brew_id: data.brew_id, ...qc, notes: data.notes.trim() || null, updated_by: user.email ?? user.id, updated_at: now }, { onConflict: 'brew_id' })
    if (qcError) {
      console.error('[packageBrew] QC save failed:', qcError.message)
      revalidatePath('/')
      return fail(`Packaged, but the QC and stock figures did not save: ${qcError.message}`)
    }
  }

  revalidatePath('/')
  revalidatePath('/history')
  return { ok: true, note: stockNote || undefined }
}

// ── COGS ─────────────────────────────────────────────────────

function convertUnits(qty: number, fromUnit: string | null, toUnit: string | null): number | null {
  const f = fromUnit?.toLowerCase().trim() ?? ''
  const t = toUnit?.toLowerCase().trim() ?? ''
  if (f === t) return qty
  if ((f === 'g') && (t === 'kg')) return qty / 1000
  if ((f === 'kg') && (t === 'g')) return qty * 1000
  if ((f === 'ml') && (t === 'l')) return qty / 1000
  if ((f === 'l') && (t === 'ml')) return qty * 1000
  return null
}

export async function getBrewCogs(brew_id: string): Promise<{
  totalCost: number | null
  costPerL: number | null
  recipeVolumeL: number | null
  breakdown: { name: string; quantity: number | null; unit: string | null; pricePerUnit: number | null; priceUnit: string | null; cost: number | null; supplier: string | null; unlinked: boolean }[]
}> {
  const supabase = await createClient()

  const { data: brew } = await supabase
    .from('brews').select('recipe_id').eq('id', brew_id).single()
  if (!brew?.recipe_id) return { totalCost: null, costPerL: null, recipeVolumeL: null, breakdown: [] }

  const [{ data: recipe }, { data: ingredients }] = await Promise.all([
    supabase.from('recipes').select('brew_volume_l').eq('id', brew.recipe_id).single(),
    supabase.from('recipe_ingredients')
      .select('name, quantity, unit, ingredient_id')
      .eq('recipe_id', brew.recipe_id)
      .order('sort_order'),
  ])

  if (!ingredients?.length) return { totalCost: null, costPerL: null, recipeVolumeL: recipe?.brew_volume_l ?? null, breakdown: [] }

  const ingredientIds = ingredients.filter(i => i.ingredient_id).map(i => i.ingredient_id as string)
  const priceMap = new Map<string, { price_per_unit: number | null; unit: string; supplier: string }>()

  if (ingredientIds.length > 0) {
    const { data: prices } = await supabase
      .from('ingredient_prices')
      .select('ingredient_id, price_per_unit, unit, supplier, imported_at')
      .in('ingredient_id', ingredientIds)
      .order('imported_at', { ascending: false })
    for (const p of prices ?? []) {
      if (!priceMap.has(p.ingredient_id)) priceMap.set(p.ingredient_id, p)
    }
  }

  let totalCost = 0
  let hasCost = false

  const breakdown = ingredients.map(ing => {
    const price = ing.ingredient_id ? priceMap.get(ing.ingredient_id) : null
    let cost: number | null = null
    if (price?.price_per_unit != null && ing.quantity != null) {
      const converted = convertUnits(ing.quantity, ing.unit, price.unit)
      if (converted !== null) {
        cost = converted * price.price_per_unit
        totalCost += cost
        hasCost = true
      }
    }
    return {
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      pricePerUnit: price?.price_per_unit ?? null,
      priceUnit: price?.unit ?? null,
      cost,
      supplier: price?.supplier ?? null,
      unlinked: !ing.ingredient_id,
    }
  })

  const recipeVolumeL = recipe?.brew_volume_l ?? null
  return {
    totalCost: hasCost ? totalCost : null,
    costPerL: hasCost && recipeVolumeL ? totalCost / recipeVolumeL : null,
    recipeVolumeL,
    breakdown,
  }
}

// ── Chart data ────────────────────────────────────────────────

type TempRow = { recorded_at: string; temperature_c: number; set_point_c: number | null }

export async function getBrewChartData(brew_id: string, tank_id: string, brew_day: string) {
  const supabase = await createClient()

  // A transferred beer was in another tank before: its temperatures come from
  // whichever tank it was in at the time, not from where it sits now.
  const { data: moves } = await supabase.from('transfers')
    .select('source_tank_id, dest_tank_id, transferred_at').eq('brew_id', brew_id).order('transferred_at')
  const legs: { tank: string; from: string; to: string | null }[] = moves?.length
    ? [
        { tank: moves[0].source_tank_id, from: brew_day, to: moves[0].transferred_at },
        ...moves.map((m, i) => ({ tank: m.dest_tank_id, from: m.transferred_at, to: moves[i + 1]?.transferred_at ?? null })),
      ]
    : [{ tank: tank_id, from: brew_day, to: null }]

  const [{ data: readings }, tempLegs, { data: vdk }, { data: { user } }] = await Promise.all([
    supabase.from('gravity_readings')
      .select('id, recorded_at, plato, ph, temperature_c, recorded_by, notes')
      .eq('brew_id', brew_id)
      .order('recorded_at'),
    // Every ten-minute reading, paged: a few weeks in one tank runs past the API's 1,000-row cap
    Promise.all(legs.map((leg) => all<TempRow>((from, to) => {
      let q = supabase.from('temperature_readings')
        .select('recorded_at, temperature_c, set_point_c')
        .eq('tank_id', leg.tank)
        .gte('recorded_at', leg.from)
      if (leg.to) q = q.lt('recorded_at', leg.to)
      return q.order('recorded_at').range(from, to)
    }))),
    supabase.from('vdk_readings')
      .select('id, recorded_at, result, recorded_by, notes')
      .eq('brew_id', brew_id)
      .order('recorded_at'),
    supabase.auth.getUser(),
  ])

  return {
    readings: readings ?? [],
    // Full resolution. The chart thins it to suit the range being looked at.
    temps: tempLegs.flat(),
    vdk: (vdk ?? []) as { id: string; recorded_at: string; result: string; recorded_by: string; notes: string | null }[],
    /** When it last moved tank, or null. The chart starts here unless asked for the whole brew. */
    transferredAt: (moves?.at(-1)?.transferred_at as string | undefined) ?? null,
    /** Whether this viewer gets the delete button on readings (James only) */
    canDelete: isOwnerEmail(user?.email),
  }
}

// ── VDK readings ──────────────────────────────────────────────

export async function logVdkReading(data: {
  brew_id: string
  tank_id: string
  result: 'high' | 'medium' | 'low' | 'pass'
  recorded_by: string
  notes: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('vdk_readings').insert({
    brew_id: data.brew_id,
    tank_id: data.tank_id,
    result: data.result,
    recorded_by: data.recorded_by,
    notes: data.notes.trim() || null,
  })
  if (error) throw error

  // A pass only records the result. The tank stays on diacetyl rest so others
  // can keep testing until the team agrees to move it on.
  revalidatePath('/')
}

/** Correct a VDK result that was logged wrongly. */
export async function updateVdkReading(id: string, result: 'high' | 'medium' | 'low' | 'pass'): Promise<ActionResult> {
  if (!['high', 'medium', 'low', 'pass'].includes(result)) return fail('That is not a VDK result.')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')
  const { data, error } = await supabase.from('vdk_readings').update({ result }).eq('id', id).select('id')
  if (error) return fail(`Not saved: ${error.message}`)
  if (!data?.length) return fail('That result could not be changed. Refresh and try again.')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteVdkReading(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')
  const { data, error } = await supabase.from('vdk_readings').delete().eq('id', id).select('id')
  if (error) return fail(`Not deleted: ${error.message}`)
  if (!data?.length) return fail('That result could not be deleted. Refresh and try again.')
  revalidatePath('/')
  return { ok: true }
}

export async function getBrewVdkReadings(brew_id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vdk_readings')
    .select('id, result, recorded_at, recorded_by, notes')
    .eq('brew_id', brew_id)
    .order('recorded_at', { ascending: false })
    .limit(14)
  return (data ?? []) as { id: string; result: 'high' | 'medium' | 'low' | 'pass'; recorded_at: string; recorded_by: string; notes: string | null }[]
}

// ── Update batch code ─────────────────────────────────────────

export async function updateBrewVolume(brew_id: string, volume_l: number, reason = '') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!(volume_l > 0 && volume_l < 20000)) throw new Error('Volume must be more than zero.')
  const { data: before } = await supabase.from('brews').select('volume_l, tank_id').eq('id', brew_id).maybeSingle()
  const { error } = await supabase
    .from('brews')
    .update({ volume_l, updated_at: new Date().toISOString() })
    .eq('id', brew_id)
  if (error) throw error

  // Leave a line in the tank's log so a lower figure at packaging has an explanation
  const was = before ? Number(before.volume_l) : null
  if (before?.tank_id && user && was != null && was !== volume_l) {
    const diff = Math.round(Math.abs(volume_l - was) * 10) / 10
    await supabase.from('gravity_readings').insert({
      brew_id, tank_id: before.tank_id, plato: null, ph: null,
      notes: `${volume_l < was ? 'Removed' : 'Added'} ${diff} L, now ${volume_l} L${reason.trim() ? `. ${reason.trim().slice(0, 120)}` : ''}`,
      recorded_by: user.email ?? user.id,
    })
  }
  // The Splits sheet plans off this number
  if (was !== volume_l) after(() => writeSplitVolume(brew_id).then(() => undefined))
  revalidatePath('/')
}

export async function renameBrew(brew_id: string, beer_name: string, style?: string | null, colour?: string | null): Promise<ActionResult> {
  const name = beer_name.trim()
  if (!name) return fail('Give the beer a name.')
  if (name.length > 120) return fail('That name is too long.')
  // undefined = leave the style alone; an empty box = clear it
  const nextStyle = style === undefined ? undefined : (style ?? '').trim().slice(0, 80) || null
  // undefined = leave the colour alone; null = go back to the style's colour
  if (colour != null && !/^#[0-9A-Fa-f]{6}$/.test(colour)) return fail('That is not a colour.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  const { data, error } = await supabase
    .from('brews')
    .update({ beer_name: name, ...(nextStyle !== undefined ? { style: nextStyle } : {}), ...(colour !== undefined ? { colour } : {}), updated_at: new Date().toISOString() })
    .eq('id', brew_id)
    .select('id')
  if (error) return fail(`Not saved: ${error.message}`)
  if (!data?.length) return fail('That brew could not be renamed. Refresh the page and try again.')

  revalidatePath('/')
  revalidatePath('/history')
  revalidatePath('/readings')
  return { ok: true }
}

export async function updateBatchCode(brew_id: string, batch_code: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('brews')
    .update({ batch_code: batch_code.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', brew_id)
  if (error) throw error
  revalidatePath('/')
}

// ── Packaging split ───────────────────────────────────────────

export async function savePackagingSplit(data: {
  brew_id?: string | null
  scheduled_brew_id?: string | null
  hop_load: HopLoad
  qty_24x375: number
  qty_16x440: number
  qty_keg30: number
  qty_keg50: number
  notes: string
  abv?: number | null
  excise_category?: ExciseCategory | null
  clip_colour?: string | null
  collars_on_site?: number
  decals_on_site?: number
}) {
  const supabase = await createClient()

  // Find existing split by either ID
  let existingId: string | null = null
  if (data.brew_id) {
    const { data: row } = await supabase
      .from('packaging_splits').select('id').eq('brew_id', data.brew_id).maybeSingle()
    existingId = row?.id ?? null
  }
  if (!existingId && data.scheduled_brew_id) {
    const { data: row } = await supabase
      .from('packaging_splits').select('id').eq('scheduled_brew_id', data.scheduled_brew_id).maybeSingle()
    existingId = row?.id ?? null
  }

  const payload = {
    hop_load: data.hop_load,
    qty_24x375: data.qty_24x375,
    qty_16x440: data.qty_16x440,
    qty_keg30: data.qty_keg30,
    qty_keg50: data.qty_keg50,
    notes: data.notes.trim() || null,
    abv: data.abv ?? null,
    excise_category: data.excise_category ?? null,
    clip_colour: data.clip_colour?.trim() || null,
    collars_on_site: data.collars_on_site ?? 0,
    decals_on_site: data.decals_on_site ?? 0,
    updated_at: new Date().toISOString(),
  }

  if (existingId) {
    // A split is reachable from the tank card (brew_id) and from the schedule
    // (scheduled_brew_id). Each caller knows only its own link, so an edit sets
    // the link it has and leaves the other one alone.
    const links: { brew_id?: string; scheduled_brew_id?: string } = {}
    if (data.brew_id) links.brew_id = data.brew_id
    if (data.scheduled_brew_id) links.scheduled_brew_id = data.scheduled_brew_id
    const { error } = await supabase.from('packaging_splits').update({ ...payload, ...links }).eq('id', existingId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('packaging_splits').insert({
      ...payload,
      brew_id: data.brew_id ?? null,
      scheduled_brew_id: data.scheduled_brew_id ?? null,
    })
    if (error) throw error
  }

  revalidatePath('/')
  revalidatePath('/schedule')
}

export async function getPackagingSplit(brew_id: string): Promise<PackagingSplit | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packaging_splits')
    .select('id, brew_id, scheduled_brew_id, hop_load, qty_24x375, qty_16x440, qty_keg30, qty_keg50, notes, abv, excise_category, clip_colour, collars_on_site, decals_on_site')
    .eq('brew_id', brew_id)
    .maybeSingle()
  return data as PackagingSplit | null
}

export async function getScheduledSplit(scheduled_brew_id: string): Promise<PackagingSplit | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packaging_splits')
    .select('id, brew_id, scheduled_brew_id, hop_load, qty_24x375, qty_16x440, qty_keg30, qty_keg50, notes, abv, excise_category, clip_colour, collars_on_site, decals_on_site')
    .eq('scheduled_brew_id', scheduled_brew_id)
    .maybeSingle()
  return data as PackagingSplit | null
}

// ── End brew (CIP / legacy) ───────────────────────────────────

export async function endBrew(brew_id: string, final_stage: 'transferred' | 'packaged' | 'cleaning') {
  const supabase = await createClient()
  const [{ data: { user } }, { data: ending }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('brews').select('beer_name, tank_id').eq('id', brew_id).maybeSingle(),
  ])
  const { error } = await supabase.from('brews').update({
    stage: final_stage,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', brew_id)
  if (error) throw error
  // An empty tank is not held at a temperature
  const off = ending ? await coolingOff(ending.tank_id) : false
  if (ending) logActivity(`${who(user?.email)} emptied ${await tankName(supabase, ending.tank_id)} (${esc(ending.beer_name)}) for cleaning.${off ? ' Cooling switched off.' : ''}`)
  revalidatePath('/')
}
