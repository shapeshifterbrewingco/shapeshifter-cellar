'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { findCandidates, isConfidentMatch } from '@/lib/matching'
import type { LibraryEntry, MatchCandidate } from '@/lib/matching'

export interface UnmatchedRow {
  id: string
  recipeId: string
  recipeName: string
  name: string
  category: string | null
  quantity: number | null
  unit: string | null
  additionStage: string | null
  linkedId: string | null
  linkedName: string | null
  linkedPrice: number | null
  linkedUnit: string | null
  candidates: MatchCandidate[]
  confident: boolean
}

/** The whole priced library, flattened one row per ingredient. */
async function loadLibrary(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<LibraryEntry[]> {
  const { data } = await supabase
    .from('ingredients')
    .select('id, name, category, ingredient_prices(price_per_unit, unit, supplier, producer, is_preferred)')
    .is('deleted_at', null)

  type Row = {
    id: string; name: string; category: string
    ingredient_prices: {
      price_per_unit: number | null; unit: string
      supplier: string; producer: string | null; is_preferred: boolean | null
    }[] | null
  }

  return ((data ?? []) as unknown as Row[]).map((i) => {
    const prices = i.ingredient_prices ?? []
    const chosen = prices.find((p) => p.is_preferred) ?? prices.find((p) => p.price_per_unit != null) ?? prices[0]
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      producer: chosen?.producer ?? null,
      supplier: chosen?.supplier ?? null,
      pricePerUnit: chosen?.price_per_unit != null ? Number(chosen.price_per_unit) : null,
      unit: chosen?.unit ?? null,
    }
  })
}

/** Every recipe ingredient with its match state. Pass a recipeId to narrow. */
export async function getMatchRows(recipeId?: string): Promise<UnmatchedRow[]> {
  const supabase = await createClient()

  let q = supabase
    .from('recipe_ingredients')
    .select('id, recipe_id, name, category, quantity, unit, addition_stage, ingredient_id, recipes(name)')
    .order('sort_order')
  if (recipeId) q = q.eq('recipe_id', recipeId)

  const [{ data: rows }, library] = await Promise.all([q, loadLibrary(supabase)])
  const byId = new Map(library.map((l) => [l.id, l]))

  type Row = {
    id: string; recipe_id: string; name: string; category: string | null
    quantity: number | null; unit: string | null; addition_stage: string | null
    ingredient_id: string | null
    recipes: { name: string } | null
  }

  return ((rows ?? []) as unknown as Row[]).map((r) => {
    const linked = r.ingredient_id ? byId.get(r.ingredient_id) : undefined
    const candidates = r.ingredient_id ? [] : findCandidates(r.name, r.category, library)
    return {
      id: r.id,
      recipeId: r.recipe_id,
      recipeName: r.recipes?.name ?? '',
      name: r.name,
      category: r.category,
      quantity: r.quantity != null ? Number(r.quantity) : null,
      unit: r.unit,
      additionStage: r.addition_stage,
      linkedId: r.ingredient_id,
      linkedName: linked?.name ?? null,
      linkedPrice: linked?.pricePerUnit ?? null,
      linkedUnit: linked?.unit ?? null,
      candidates,
      confident: isConfidentMatch(candidates),
    }
  })
}

export async function linkIngredient(recipeIngredientId: string, ingredientId: string | null) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('recipe_ingredients')
    .update({ ingredient_id: ingredientId })
    .eq('id', recipeIngredientId)
  if (error) throw error
  revalidatePath('/costing')
}

/**
 * Link only the rows where there is a single unambiguous match.
 * Everything else is left for a human — a wrong link is a wrong cost.
 */
export async function autoLinkConfident(recipeId?: string): Promise<{ linked: number; remaining: number }> {
  const supabase = await createClient()
  const rows = await getMatchRows(recipeId)
  const todo = rows.filter((r) => !r.linkedId && r.confident)

  for (const r of todo) {
    await supabase
      .from('recipe_ingredients')
      .update({ ingredient_id: r.candidates[0].id })
      .eq('id', r.id)
  }

  revalidatePath('/costing')
  return {
    linked: todo.length,
    remaining: rows.filter((r) => !r.linkedId).length - todo.length,
  }
}

// ── Preferred supplier price ─────────────────────────────────

export interface PriceOption {
  id: string
  supplier: string
  producer: string | null
  pricePerUnit: number | null
  unit: string
  isPreferred: boolean
}

export async function getPriceOptions(ingredientId: string): Promise<PriceOption[]> {
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
    id: p.id,
    supplier: p.supplier,
    producer: p.producer,
    pricePerUnit: p.price_per_unit != null ? Number(p.price_per_unit) : null,
    unit: p.unit,
    isPreferred: p.is_preferred ?? false,
  }))
}

export async function setPreferredPrice(ingredientId: string, priceId: string) {
  const supabase = await createClient()
  await supabase.from('ingredient_prices')
    .update({ is_preferred: false }).eq('ingredient_id', ingredientId)
  const { error } = await supabase.from('ingredient_prices')
    .update({ is_preferred: true }).eq('id', priceId)
  if (error) throw error
  revalidatePath('/costing')
}
