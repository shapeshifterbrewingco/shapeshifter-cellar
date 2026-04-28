'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function updateReading(id: string, data: {
  plato: number | null
  ph: number | null
  notes: string
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gravity_readings')
    .update({ plato: data.plato, ph: data.ph, notes: data.notes.trim() || null })
    .eq('id', id)
  if (error) throw error
  revalidatePath('/readings')
}

export async function deleteReading(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('gravity_readings')
    .delete()
    .eq('id', id)
  if (error) throw error
  revalidatePath('/readings')
}
