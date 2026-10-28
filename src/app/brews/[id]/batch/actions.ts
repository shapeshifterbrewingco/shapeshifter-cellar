'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/** Set or clear a brew's batch number (the one printed on carton stickers). Brewers and admins only. */
export async function setBatchCode(brewId: string, code: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin' && me?.role !== 'brewer') return { ok: false, message: 'Only brewers can set batch numbers.' }
  const clean = code.trim().slice(0, 40) || null
  const { error } = await supabase.from('brews').update({ batch_code: clean, updated_at: new Date().toISOString() }).eq('id', brewId)
  if (error) return { ok: false, message: `Not saved: ${error.message}` }
  revalidatePath('/')
  revalidatePath('/history')
  return { ok: true, message: clean ? `Batch number set to ${clean}.` : 'Batch number cleared.' }
}
