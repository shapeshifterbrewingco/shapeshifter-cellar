import type { SupabaseClient } from '@supabase/supabase-js'
import type { IngredientCategory } from '@/types'

const VALID_CATEGORIES: IngredientCategory[] = [
  'malt', 'hop', 'yeast', 'adjunct', 'finings', 'water_treatment', 'other',
]

export function safeCategory(raw: string | null | undefined): IngredientCategory {
  const c = raw?.toLowerCase().trim() as IngredientCategory
  return VALID_CATEGORIES.includes(c) ? c : 'other'
}

export interface IngredientRow {
  id: string
  name: string
  category: IngredientCategory
  default_unit: string
  is_favourite: boolean
}

export async function getAllIngredients(supabase: SupabaseClient): Promise<IngredientRow[]> {
  const { data } = await supabase
    .from('ingredients')
    .select('id, name, category, default_unit, is_favourite')
    .is('deleted_at', null)
    .order('is_favourite', { ascending: false })
    .order('name')
  return (data ?? []) as IngredientRow[]
}

export interface PriceRecord {
  id: string
  supplier: string
  producer: string
  supplier_code: string | null
  price_per_unit: number | null
  unit: string
  imported_at: string
}

export interface IngredientWithPrices extends IngredientRow {
  ingredient_prices: PriceRecord[]
}

export async function getAllIngredientsWithPrices(supabase: SupabaseClient): Promise<IngredientWithPrices[]> {
  const { data } = await supabase
    .from('ingredients')
    .select('id, name, category, default_unit, is_favourite, ingredient_prices(id, supplier, producer, supplier_code, price_per_unit, unit, imported_at)')
    .is('deleted_at', null)
    .order('is_favourite', { ascending: false })
    .order('name')
  return (data ?? []) as IngredientWithPrices[]
}

export async function getBeerStyles(supabase: SupabaseClient): Promise<{ name: string; hex_colour: string }[]> {
  const { data } = await supabase
    .from('beer_styles')
    .select('name, hex_colour')
    .order('sort_order')
  return data ?? []
}

export async function upsertIngredients(
  supabase: SupabaseClient,
  items: { name: string; category: IngredientCategory; unit: string | null }[]
) {
  const rows = items
    .filter((i) => i.name.trim())
    .map((i) => ({
      name: i.name.trim(),
      category: safeCategory(i.category),
      default_unit: i.unit ?? 'kg',
    }))
  if (rows.length === 0) return

  await supabase
    .from('ingredients')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
}
