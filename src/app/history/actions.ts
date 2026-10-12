'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateBrewHistory(
  brew_id: string,
  data: {
    beer_name: string
    batch_code: string | null
    style: string | null
    brew_day: string
    volume_l: number
    og_plato: number | null
    notes: string | null
  }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('brews')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', brew_id)
  if (error) throw error
  revalidatePath('/history')
}

export async function deleteBrewHistory(brew_id: string) {
  const supabase = await createClient()
  // Packaging runs, transfers and stage history hold a reference to the brew,
  // so they go first. Readings, VDK and splits cascade with the brew row.
  for (const table of ['packaging_runs', 'transfers', 'tank_stage_history'] as const) {
    const { error } = await supabase.from(table).delete().eq('brew_id', brew_id)
    if (error) throw error
  }
  const { error } = await supabase.from('brews').delete().eq('id', brew_id)
  if (error) throw error
  revalidatePath('/history')
}

export async function deletePackagingRun(run_id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('packaging_runs').delete().eq('id', run_id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Packaging run was not deleted (no permission or already gone)')
  revalidatePath('/history')
}

export async function updatePackagingRun(run_id: string, qty: number, volume_l: number) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('packaging_runs')
    .update({ qty, volume_l })
    .eq('id', run_id)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Packaging run was not updated (no permission or already gone)')
  revalidatePath('/history')
}
