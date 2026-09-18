'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_SETTINGS } from '@/types'
import type { AppSettings } from '@/types'

export async function getSettings(): Promise<AppSettings> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('diacetyl_rest_temp_c, on_chill_temp_c, ale_weeks, lager_weeks, default_hop_load, default_brew_volume_l, excise_rate_can_std, excise_rate_keg_std, excise_rate_rtd, excise_rate_keg_mid, sa_canning_rate_per_l, sa_canning_rate_per_end, overhead_labour_per_batch, overhead_energy_per_batch, overhead_chemicals_per_batch, overhead_water_per_batch, overhead_other_per_l, default_loss_pct, default_clarity')
    .eq('id', 1)
    .maybeSingle()
  if (!data) return DEFAULT_SETTINGS
  // Merge over defaults so a column added after deploy never reads back undefined
  return { ...DEFAULT_SETTINGS, ...data } as AppSettings
}

export async function updateSettings(settings: Partial<AppSettings>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) throw error
  revalidatePath('/', 'layout')
}
