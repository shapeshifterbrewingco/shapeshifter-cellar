'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { upsertIngredients, safeCategory } from '@/lib/ingredients'
import type { RecipeIngredient } from '@/types'

export type RecipeFormData = {
  name: string
  style: string
  tag: string | null
  customStyleColour: string | null
  target_abv: string
  target_og_plato: string
  target_fg_plato: string
  target_ibu: string
  target_ebc: string
  brew_volume_l: string
  foundation_l: string
  sparge_l: string
  boil_duration_min: string
  mash_temp_c: string
  pitch_temp_c: string
  ferment_temp_c: string
  notes: string
  ingredients: Omit<RecipeIngredient, 'id' | 'recipe_id'>[]
}

function parseNum(val: string): number | null {
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function parseIntVal(val: string): number | null {
  const n = global.parseInt(val, 10)
  return isNaN(n) ? null : n
}

async function saveCustomStyle(style: string, colour: string) {
  // Use service client to bypass admin-only RLS on existing styles,
  // but only insert if not already present
  const supabase = createServiceClient()
  await supabase
    .from('beer_styles')
    .upsert({ name: style, hex_colour: colour, sort_order: 999 }, { onConflict: 'name', ignoreDuplicates: true })
}

export async function createRecipe(data: RecipeFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (data.customStyleColour && data.style) {
    await saveCustomStyle(data.style, data.customStyleColour)
  }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      name: data.name.trim(),
      style: data.style || null,
      tag: data.tag || null,
      target_abv: parseNum(data.target_abv),
      target_og_plato: parseNum(data.target_og_plato),
      target_fg_plato: parseNum(data.target_fg_plato),
      target_ibu: parseIntVal(data.target_ibu),
      target_ebc: parseIntVal(data.target_ebc),
      brew_volume_l: parseNum(data.brew_volume_l),
      foundation_l: parseNum(data.foundation_l),
      sparge_l: parseNum(data.sparge_l),
      boil_duration_min: parseIntVal(data.boil_duration_min),
      mash_temp_c: parseNum(data.mash_temp_c),
      pitch_temp_c: parseNum(data.pitch_temp_c),
      ferment_temp_c: parseNum(data.ferment_temp_c),
      notes: data.notes.trim() || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createRecipe] recipes insert error:', JSON.stringify(error))
    throw error
  }

  if (data.ingredients.length > 0) {
    const rows = data.ingredients.map((ing, i) => ({
      recipe_id: recipe.id,
      name: ing.name, category: safeCategory(ing.category), addition_stage: ing.addition_stage,
      quantity: (typeof ing.quantity === 'number' && !isNaN(ing.quantity)) ? ing.quantity : null,
      unit: ing.unit || null,
      time_minutes: (typeof ing.time_minutes === 'number' && !isNaN(ing.time_minutes)) ? ing.time_minutes : null,
      trigger: ing.trigger || null, sort_order: i,
    }))
    const { error: ingError } = await supabase.from('recipe_ingredients').insert(rows)
    if (ingError) {
      console.error('[createRecipe] recipe_ingredients insert error:', JSON.stringify(ingError), 'rows:', JSON.stringify(rows))
      throw ingError
    }

    // Grow the master ingredient list
    await upsertIngredients(supabase, data.ingredients.map((i) => ({
      name: i.name, category: i.category, unit: i.unit,
    })))
  }

  revalidatePath('/recipes')
  redirect(`/recipes/${recipe.id}`)
}

export async function updateRecipe(id: string, data: RecipeFormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  if (data.customStyleColour && data.style) {
    await saveCustomStyle(data.style, data.customStyleColour)
  }

  const { error } = await supabase
    .from('recipes')
    .update({
      name: data.name.trim(),
      style: data.style || null,
      tag: data.tag || null,
      target_abv: parseNum(data.target_abv),
      target_og_plato: parseNum(data.target_og_plato),
      target_fg_plato: parseNum(data.target_fg_plato),
      target_ibu: parseIntVal(data.target_ibu),
      target_ebc: parseIntVal(data.target_ebc),
      brew_volume_l: parseNum(data.brew_volume_l),
      foundation_l: parseNum(data.foundation_l),
      sparge_l: parseNum(data.sparge_l),
      boil_duration_min: parseIntVal(data.boil_duration_min),
      mash_temp_c: parseNum(data.mash_temp_c),
      pitch_temp_c: parseNum(data.pitch_temp_c),
      ferment_temp_c: parseNum(data.ferment_temp_c),
      notes: data.notes.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    console.error('[updateRecipe] recipes update error:', JSON.stringify(error))
    throw error
  }

  await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)
  if (data.ingredients.length > 0) {
    const rows = data.ingredients.map((ing, i) => ({
      recipe_id: id,
      name: ing.name, category: safeCategory(ing.category), addition_stage: ing.addition_stage,
      quantity: (typeof ing.quantity === 'number' && !isNaN(ing.quantity)) ? ing.quantity : null,
      unit: ing.unit || null,
      time_minutes: (typeof ing.time_minutes === 'number' && !isNaN(ing.time_minutes)) ? ing.time_minutes : null,
      trigger: ing.trigger || null, sort_order: i,
    }))
    const { error: ingError } = await supabase.from('recipe_ingredients').insert(rows)
    if (ingError) {
      console.error('[updateRecipe] recipe_ingredients insert error:', JSON.stringify(ingError), 'rows:', JSON.stringify(rows))
      throw ingError
    }

    await upsertIngredients(supabase, data.ingredients.map((i) => ({
      name: i.name, category: i.category, unit: i.unit,
    })))
  }

  revalidatePath('/recipes')
  revalidatePath(`/recipes/${id}`)
  redirect(`/recipes/${id}`)
}

export async function deleteRecipe(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await supabase
    .from('recipes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  revalidatePath('/recipes')
  redirect('/recipes')
}
