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
  await supabase.from('gravity_readings').delete().eq('brew_id', brew_id)
  await supabase.from('packaging_runs').delete().eq('brew_id', brew_id)
  await supabase.from('transfers').delete().eq('brew_id', brew_id)
  const { error } = await supabase.from('brews').delete().eq('id', brew_id)
  if (error) throw error
  revalidatePath('/history')
}

export async function deletePackagingRun(run_id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('packaging_runs').delete().eq('id', run_id)
  if (error) throw error
  revalidatePath('/history')
}

export async function updatePackagingRun(run_id: string, qty: number, volume_l: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('packaging_runs')
    .update({ qty, volume_l })
    .eq('id', run_id)
  if (error) throw error
  revalidatePath('/history')
}
