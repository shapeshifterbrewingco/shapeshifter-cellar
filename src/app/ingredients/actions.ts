'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { IngredientCategory } from '@/types'
import { safeCategory } from '@/lib/ingredients'

export async function createIngredient(data: {
  name: string
  category: IngredientCategory
  unit: string
  supplier?: string
  producer?: string
  price?: number | null
}): Promise<{ id: string; name: string; category: IngredientCategory; default_unit: string; is_favourite: boolean }> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('ingredients')
    .select('id, name, category, default_unit, is_favourite')
    .eq('name', data.name.trim())
    .maybeSingle()

  if (existing) return existing as { id: string; name: string; category: IngredientCategory; default_unit: string; is_favourite: boolean }

  const { data: ing, error } = await supabase
    .from('ingredients')
    .insert({ name: data.name.trim(), category: safeCategory(data.category), default_unit: data.unit || 'kg' })
    .select('id, name, category, default_unit, is_favourite')
    .single()
  if (error) throw error

  if (data.supplier?.trim()) {
    await supabase.from('ingredient_prices').insert({
      ingredient_id: ing.id,
      supplier: data.supplier.trim(),
      producer: data.producer?.trim() ?? '',
      price_per_unit: data.price ?? null,
      unit: data.unit || 'kg',
    })
  }

  revalidatePath('/ingredients')
  revalidatePath('/recipes')
  return ing as { id: string; name: string; category: IngredientCategory; default_unit: string; is_favourite: boolean }
}

export async function deleteIngredient(id: string) {
  const supabase = await createClient()
  await supabase.from('ingredients').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/ingredients')
  revalidatePath('/recipes')
}

export async function deleteIngredients(ids: string[]) {
  if (ids.length === 0) return
  const supabase = await createClient()
  await supabase
    .from('ingredients')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', ids)
  revalidatePath('/ingredients')
  revalidatePath('/recipes')
}

export interface EditPrice {
  id: string
  supplier: string
  producer: string
  price_per_unit: number | null
  unit: string
}

export async function updateIngredient(
  id: string,
  data: { name: string; category: IngredientCategory; unit: string; prices: EditPrice[] }
) {
  const supabase = await createClient()
  await supabase.from('ingredients').update({
    name: data.name.trim(),
    category: safeCategory(data.category),
    default_unit: data.unit,
  }).eq('id', id)
  for (const p of data.prices) {
    if (p.id) {
      await supabase.from('ingredient_prices').update({
        supplier: p.supplier.trim(),
        producer: p.producer.trim(),
        price_per_unit: p.price_per_unit,
        unit: p.unit,
      }).eq('id', p.id)
    } else if (p.supplier.trim()) {
      await supabase.from('ingredient_prices').insert({
        ingredient_id: id,
        supplier: p.supplier.trim(),
        producer: p.producer.trim() ?? '',
        price_per_unit: p.price_per_unit,
        unit: p.unit || 'kg',
        imported_at: new Date().toISOString(),
      })
    }
  }
  revalidatePath('/ingredients')
  revalidatePath('/recipes')
}

export async function toggleFavourite(id: string, isFavourite: boolean) {
  const supabase = await createClient()
  await supabase.from('ingredients').update({ is_favourite: isFavourite }).eq('id', id)
  revalidatePath('/ingredients')
  revalidatePath('/recipes')
}

export interface ImportItem {
  selected: boolean
  name: string
  producer: string
  category: IngredientCategory
  unit: string
  price: number | null
  supplier_code: string | null
  supplier: string
}

export async function importPriceList(items: ImportItem[]): Promise<{ imported: number }> {
  const supabase = await createClient()
  const selected = items.filter((i) => i.selected && i.name.trim())

  let imported = 0
  for (const item of selected) {
    // Upsert ingredient by name
    const { data: existing } = await supabase
      .from('ingredients')
      .select('id')
      .eq('name', item.name.trim())
      .maybeSingle()

    let ingredientId: string

    if (existing) {
      ingredientId = existing.id
    } else {
      const { data: created, error } = await supabase
        .from('ingredients')
        .insert({ name: item.name.trim(), category: safeCategory(item.category), default_unit: item.unit })
        .select('id')
        .single()
      if (error || !created) continue
      ingredientId = created.id
    }

    // Upsert price record for this supplier + producer combination
    await supabase.from('ingredient_prices').upsert(
      {
        ingredient_id: ingredientId,
        supplier: item.supplier,
        producer: item.producer ?? '',
        supplier_code: item.supplier_code,
        price_per_unit: item.price,
        unit: item.unit,
        imported_at: new Date().toISOString(),
      },
      { onConflict: 'ingredient_id,supplier,producer' }
    )
    imported++
  }

  revalidatePath('/ingredients')
  revalidatePath('/recipes')
  return { imported }
}
