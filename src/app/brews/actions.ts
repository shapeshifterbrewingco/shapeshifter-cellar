'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { setTankTarget } from '@/app/tanks/actions'
import { STAGE_LABELS } from '@/types'
import type { TankStage, PackageFormat, HopLoad, ExciseCategory, PackagingSplit } from '@/types'

// ── Batch code ────────────────────────────────────────────────

async function generateBatchCode(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${year}-`
  const { data } = await supabase
    .from('brews')
    .select('batch_code')
    .like('batch_code', `${prefix}%`)
    .order('batch_code', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastNum = data?.batch_code ? parseInt(data.batch_code.split('-')[1], 10) : 0
  return `${prefix}${String(lastNum + 1).padStart(3, '0')}`
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
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: brew, error } = await supabase.from('brews').insert({
    tank_id: data.tank_id,
    recipe_id: data.recipe_id || null,
    beer_name: data.beer_name.trim(),
    style: data.style || null,
    brew_day: data.brew_day,
    volume_l: data.volume_l,
    og_plato: data.og_plato,
    stage: 'active_ferment',
    notes: data.notes.trim() || null,
  }).select('id').single()
  if (error) throw error

  if (data.og_plato != null || data.initial_ph != null) {
    await supabase.from('gravity_readings').insert({
      brew_id: brew.id,
      tank_id: data.tank_id,
      plato: data.og_plato,
      ph: data.initial_ph,
      recorded_by: user.email ?? user.id,
      notes: 'Initial reading',
    })
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

  revalidatePath('/')
}

// ── Log reading ───────────────────────────────────────────────

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
    plato: data.plato || null,
    ph: data.ph || null,
    notes: data.notes.trim() || null,
    recorded_by: data.recorded_by,
  })
  if (error) throw error
  revalidatePath('/')
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

  await supabase.from('gravity_readings').insert({
    brew_id,
    tank_id,
    plato: null,
    ph: null,
    recorded_by: user.email ?? user.id,
    notes: `→ ${STAGE_LABELS[stage]}`,
  })

  revalidatePath('/')
}

// ── Transfer ──────────────────────────────────────────────────

export async function transferBrew(data: {
  brew_id: string
  source_tank_id: string
  dest_tank_id: string
  volume_in_l: number
  volume_out_l: number
  batch_code: string | null
  notes: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase.from('transfers').insert({
    brew_id: data.brew_id,
    source_tank_id: data.source_tank_id,
    dest_tank_id: data.dest_tank_id,
    volume_in_l: data.volume_in_l,
    volume_out_l: data.volume_out_l,
    transferred_by: user.email ?? user.id,
    notes: data.notes.trim() || null,
  })

  await supabase.from('brews').update({
    tank_id: data.dest_tank_id,
    volume_l: data.volume_out_l,
    stage: 'on_chill',
    batch_code: data.batch_code || null,
    updated_at: new Date().toISOString(),
  }).eq('id', data.brew_id)

  await supabase.from('gravity_readings').insert({
    brew_id: data.brew_id,
    tank_id: data.dest_tank_id,
    plato: null,
    ph: null,
    recorded_by: user.email ?? user.id,
    notes: `→ Transferred (${data.volume_out_l}L)`,
  })

  revalidatePath('/')
}

// ── Package ───────────────────────────────────────────────────

export async function packageBrew(data: {
  brew_id: string
  tank_id: string
  packages: { format: PackageFormat; qty: number; volume_l: number }[]
  notes: string
  batch_code: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const now = new Date().toISOString()

  for (const pkg of data.packages.filter(p => p.qty > 0)) {
    await supabase.from('packaging_runs').insert({
      brew_id: data.brew_id,
      tank_id: data.tank_id,
      packaged_by: user.email ?? user.id,
      packaged_at: now,
      format: pkg.format,
      qty: pkg.qty,
      volume_l: pkg.volume_l,
      notes: data.notes.trim() || null,
    })
  }

  await supabase.from('brews').update({
    stage: 'packaged',
    batch_code: data.batch_code,
    deleted_at: now,
    updated_at: now,
  }).eq('id', data.brew_id)

  revalidatePath('/')
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

export async function getBrewChartData(brew_id: string, tank_id: string, brew_day: string) {
  const supabase = await createClient()

  const [{ data: readings }, { data: temps }] = await Promise.all([
    supabase.from('gravity_readings')
      .select('id, recorded_at, plato, ph, recorded_by, notes')
      .eq('brew_id', brew_id)
      .order('recorded_at'),
    supabase.from('temperature_readings')
      .select('recorded_at, temperature_c')
      .eq('tank_id', tank_id)
      .gte('recorded_at', brew_day)
      .order('recorded_at'),
  ])

  const tempsByHour = new Map<string, { recorded_at: string; temperature_c: number }>()
  for (const t of temps ?? []) {
    const hour = t.recorded_at.slice(0, 13)
    if (!tempsByHour.has(hour)) tempsByHour.set(hour, t)
  }

  return { readings: readings ?? [], temps: [...tempsByHour.values()] }
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
  revalidatePath('/')
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
    brew_id: data.brew_id ?? null,
    scheduled_brew_id: data.scheduled_brew_id ?? null,
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
    const { error } = await supabase.from('packaging_splits').update(payload).eq('id', existingId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('packaging_splits').insert(payload)
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
  const { error } = await supabase.from('brews').update({
    stage: final_stage,
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', brew_id)
  if (error) throw error
  revalidatePath('/')
}
