'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateSettings } from '@/app/settings/actions'
import type { PackageFormat } from '@/types'
import type { Clarity } from '@/lib/costing'
import type { MaterialCategory } from '@/lib/packaging-materials'

// ── Packaging material price book ────────────────────────────

export interface MaterialRow {
  id: string
  name: string
  category: MaterialCategory
  unit: string
  price_per_unit: number | null
  supplier: string | null
  supplier_code: string | null
  is_active: boolean
  usage: { format: PackageFormat; qty_per_unit: number }[]
}

export async function getMaterials(): Promise<MaterialRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('packaging_materials')
    .select('id, name, category, unit, price_per_unit, supplier, supplier_code, is_active, format_material_usage(format, qty_per_unit)')
    .order('category')
    .order('name')

  type Row = Omit<MaterialRow, 'usage'> & {
    format_material_usage: { format: PackageFormat; qty_per_unit: number }[] | null
  }

  return ((data ?? []) as unknown as Row[]).map((m) => ({
    ...m,
    price_per_unit: m.price_per_unit != null ? Number(m.price_per_unit) : null,
    usage: (m.format_material_usage ?? []).map((u) => ({
      format: u.format, qty_per_unit: Number(u.qty_per_unit),
    })),
  }))
}

export async function saveMaterial(m: {
  id?: string
  name: string
  category: MaterialCategory
  unit: string
  price_per_unit: number | null
  supplier: string | null
  supplier_code: string | null
  is_active: boolean
}) {
  const supabase = await createClient()
  const payload = { ...m, updated_at: new Date().toISOString() }

  if (m.id) {
    const { error } = await supabase.from('packaging_materials').update(payload).eq('id', m.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('packaging_materials').insert(payload)
    if (error) throw error
  }
  revalidatePath('/costing')
}

export async function deleteMaterial(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('packaging_materials').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/costing')
}

/** Set how many of a material one carton or one keg of a format consumes. Zero removes it. */
export async function setMaterialUsage(materialId: string, format: PackageFormat, qty: number) {
  const supabase = await createClient()

  if (qty <= 0) {
    const { error } = await supabase
      .from('format_material_usage')
      .delete().eq('material_id', materialId).eq('format', format)
    if (error) throw error
  } else {
    const { error } = await supabase
      .from('format_material_usage')
      .upsert({ material_id: materialId, format, qty_per_unit: qty }, { onConflict: 'format,material_id' })
    if (error) throw error
  }
  revalidatePath('/costing')
}

// ── Bright / hazy additive templates ─────────────────────────

export interface AdditiveRow {
  id: string
  clarity: Clarity
  ingredient_id: string
  ingredient_name: string
  qty_per_1000l: number
  unit: string
  notes: string | null
  has_price: boolean
}

export async function getAdditives(): Promise<AdditiveRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clarity_additives')
    .select('id, clarity, ingredient_id, qty_per_1000l, unit, notes, ingredients(name, ingredient_prices(price_per_unit))')
    .order('clarity')

  type Row = {
    id: string; clarity: Clarity; ingredient_id: string
    qty_per_1000l: number; unit: string; notes: string | null
    ingredients: { name: string; ingredient_prices: { price_per_unit: number | null }[] } | null
  }

  return ((data ?? []) as unknown as Row[]).map((a) => ({
    id: a.id,
    clarity: a.clarity,
    ingredient_id: a.ingredient_id,
    ingredient_name: a.ingredients?.name ?? 'Unknown',
    qty_per_1000l: Number(a.qty_per_1000l),
    unit: a.unit,
    notes: a.notes,
    has_price: (a.ingredients?.ingredient_prices ?? []).some((p) => p.price_per_unit != null),
  }))
}

export async function saveAdditive(a: {
  id?: string
  clarity: Clarity
  ingredient_id: string
  qty_per_1000l: number
  unit: string
  notes: string | null
}) {
  const supabase = await createClient()
  if (a.id) {
    const { error } = await supabase.from('clarity_additives')
      .update({ qty_per_1000l: a.qty_per_1000l, unit: a.unit, notes: a.notes }).eq('id', a.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('clarity_additives').upsert({
      clarity: a.clarity, ingredient_id: a.ingredient_id,
      qty_per_1000l: a.qty_per_1000l, unit: a.unit, notes: a.notes,
    }, { onConflict: 'clarity,ingredient_id' })
    if (error) throw error
  }
  revalidatePath('/costing')
}

export async function deleteAdditive(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('clarity_additives').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/costing')
}

// ── Overheads ────────────────────────────────────────────────

export async function saveOverheads(o: {
  overhead_labour_per_batch: number
  overhead_energy_per_batch: number
  overhead_chemicals_per_batch: number
  overhead_water_per_batch: number
  overhead_other_per_l: number
  default_loss_pct: number
  default_clarity: Clarity
}) {
  await updateSettings(o)
  revalidatePath('/costing')
}

// ── Ingredient picker source ─────────────────────────────────

export async function getIngredientOptions(): Promise<{ id: string; name: string; category: string }[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ingredients')
    .select('id, name, category')
    .is('deleted_at', null)
    .order('name')
  return (data ?? []) as { id: string; name: string; category: string }[]
}
