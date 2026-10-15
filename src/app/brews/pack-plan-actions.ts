'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { writeSplitVolume, writeSplitQty } from '@/lib/tank-splits'
import type { SheetSplit } from '@/lib/tank-splits'
import { PACK_CHECKS } from '@/types'
import type { PackCheckKey, PackChecks } from '@/types'

type Result = { ok: true; message: string; checks?: PackChecks } | { ok: false; message: string }

/** Tick or untick one packaging material for a batch. Everyone sees it. */
export async function setPackCheck(brewId: string, key: PackCheckKey, done: boolean): Promise<Result> {
  const item = PACK_CHECKS.find((c) => c.key === key)
  if (!item) return { ok: false, message: 'Unknown item.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }

  const { data: brew } = await supabase.from('brews').select('pack_checks').eq('id', brewId).maybeSingle()
  if (!brew) return { ok: false, message: 'That brew no longer exists.' }
  const checks: PackChecks = { ...((brew.pack_checks ?? {}) as PackChecks) }
  if (done) checks[key] = { by: user.email ?? user.id, at: new Date().toISOString() }
  else delete checks[key]

  const { error } = await supabase.from('brews').update({ pack_checks: checks, updated_at: new Date().toISOString() }).eq('id', brewId)
  if (error) return { ok: false, message: `Not saved: ${error.message}` }
  revalidatePath('/')
  return { ok: true, message: done ? item.done : `${item.label} unticked`, checks }
}

/** Put the tank's current volume into its row on the Splits sheet. */
export async function sendVolumeToSplits(brewId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }
  const res = await writeSplitVolume(brewId)
  if (!res.ok) return res
  const litres = `${res.now.toLocaleString('en-AU')} L`
  return {
    ok: true,
    message: res.changed
      ? `Splits sheet updated: ${res.row} now says ${litres}${res.was != null ? ` (was ${res.was.toLocaleString('en-AU')} L)` : ''}.`
      : `The Splits sheet already says ${litres} for ${res.row}.`,
  }
}

/**
 * Change the planned formats on a beer's Splits sheet row, from its tank card.
 * Brewers and admins only, as with the rest of the cellar.
 */
export async function saveSplitQty(brewId: string, qty: SheetSplit['qty']): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin' && me?.role !== 'brewer') return { ok: false, message: 'Only brewers can change the splits.' }

  const res = await writeSplitQty(brewId, qty)
  if (!res.ok) return res
  revalidatePath('/')
  return {
    ok: true,
    message: res.changed.length ? `Splits sheet updated for ${res.row}: ${res.changed.join(', ')}.` : 'Nothing changed.',
  }
}
