import type { SupabaseClient } from '@supabase/supabase-js'
import type { Recipe, RecipeIngredient } from '@/types'

export async function getRecipes(supabase: SupabaseClient): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name, version, style, tag, target_abv, target_og_plato, target_fg_plato, target_ibu, target_ebc, brew_volume_l, created_at, updated_at')
    .is('deleted_at', null)
    .order('name')
    .order('version', { ascending: false })

  if (error) throw error
  return (data ?? []) as Recipe[]
}

export async function getRecipe(supabase: SupabaseClient, id: string): Promise<Recipe | null> {
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) return null

  const { data: ingredients } = await supabase
    .from('recipe_ingredients')
    .select('*')
    .eq('recipe_id', id)
    .order('sort_order')

  return { ...recipe, ingredients: (ingredients ?? []) as RecipeIngredient[] } as Recipe
}
