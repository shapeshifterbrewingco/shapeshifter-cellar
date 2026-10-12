'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBrewHistoryDetail, PACK_REPORT_FIELDS } from '@/lib/history'
import type { PackReport } from '@/lib/history'

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

/** Readings and packaging runs for one finished batch. Called when it is opened. */
export async function loadBrewDetail(brew_id: string) {
  const supabase = await createClient()
  return getBrewHistoryDetail(supabase, brew_id)
}

/** Save the packaging report for a finished batch. One per brew; saving again overwrites it. */
export async function savePackagingReport(brew_id: string, report: PackReport): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out.' }

  const NUMERIC = new Set<string>(PACK_REPORT_FIELDS.filter((f) => !['best_before', 'unders', 'notes'].includes(f)))
  const row: Record<string, string | number | null> = {}
  for (const f of PACK_REPORT_FIELDS) {
    const v = report[f]
    if (v == null || v === '') { row[f] = null; continue }
    if (NUMERIC.has(f)) {
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return { ok: false, message: `${f.replace(/_/g, ' ')} is not a valid number.` }
      row[f] = n
    } else row[f] = String(v).trim() || null
  }

  const { error } = await supabase
    .from('packaging_reports')
    .upsert({ brew_id, ...row, updated_by: user.email ?? user.id, updated_at: new Date().toISOString() }, { onConflict: 'brew_id' })
  if (error) return { ok: false, message: error.message }
  revalidatePath('/history')
  return { ok: true }
}
