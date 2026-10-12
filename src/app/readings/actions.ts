'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateReading(id: string, data: {
  plato: number | null
  ph: number | null
  notes: string
}) {
  const supabase = await createClient()
  const { data: saved, error } = await supabase
    .from('gravity_readings')
    .update({ plato: data.plato, ph: data.ph, notes: data.notes.trim() || null })
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!saved?.length) throw new Error('Reading was not updated (no permission or already gone)')
  revalidatePath('/history')
}

export async function deleteReading(id: string) {
  const supabase = await createClient()
  const { data: removed, error } = await supabase
    .from('gravity_readings')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) throw error
  if (!removed?.length) throw new Error('Reading was not deleted (no permission or already gone)')
  revalidatePath('/history')
}
