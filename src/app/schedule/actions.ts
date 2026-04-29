'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ScheduledBrewStatus, ScheduledBrewEventType, ScheduledBrewType } from '@/types'

export async function createScheduledBrew(data: {
  scheduled_date: string
  recipe_id: string | null
  recipe_name: string | null
  tank_id: string | null
  dest_tank_id?: string | null
  notes: string | null
  event_type?: ScheduledBrewEventType
  brew_type?: ScheduledBrewType | null
  // if set, also create a linked pack event on this date
  pack_date?: string | null
}) {
  const supabase = await createClient()

  const { pack_date, ...row } = data

  // Insert the brew event first so we can get its ID to link transfer/pack
  const { data: brewRow, error } = await supabase
    .from('scheduled_brews')
    .insert({ ...row, event_type: row.event_type ?? 'brew' })
    .select('id')
    .single()
  if (error) throw error

  if (pack_date && brewRow) {
    // Transfer: 3 days before pack, slide back to Friday if weekend
    const td = new Date(pack_date + 'T00:00:00')
    td.setDate(td.getDate() - 3)
    const dow = td.getDay()
    if (dow === 6) td.setDate(td.getDate() - 1)      // Sat → Fri
    else if (dow === 0) td.setDate(td.getDate() - 2) // Sun → Fri
    const transfer_date = td.toISOString().slice(0, 10)

    await supabase.from('scheduled_brews').insert([
      {
        scheduled_date: transfer_date,
        recipe_id:      data.recipe_id,
        recipe_name:    data.recipe_name,
        tank_id:        data.tank_id,
        notes:          null,
        event_type:     'transfer',
        brew_type:      null,
        linked_brew_id: brewRow.id,
      },
      {
        scheduled_date: pack_date,
        recipe_id:      data.recipe_id,
        recipe_name:    data.recipe_name,
        tank_id:        data.tank_id,
        notes:          null,
        event_type:     'pack',
        brew_type:      null,
        linked_brew_id: brewRow.id,
      },
    ])
  }

  revalidatePath('/schedule')
  revalidatePath('/')
}

export async function updateScheduledBrew(id: string, data: {
  scheduled_date?: string
  recipe_id?: string | null
  recipe_name?: string | null
  tank_id?: string | null
  dest_tank_id?: string | null
  notes?: string | null
  status?: ScheduledBrewStatus
  event_type?: ScheduledBrewEventType
  brew_type?: ScheduledBrewType | null
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('scheduled_brews')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error

  // When dest_tank_id changes on a transfer, sync the linked pack event's tank
  if ('dest_tank_id' in data) {
    const { data: evt } = await supabase
      .from('scheduled_brews')
      .select('event_type, linked_brew_id')
      .eq('id', id)
      .single()
    if (evt?.event_type === 'transfer' && evt?.linked_brew_id) {
      await supabase
        .from('scheduled_brews')
        .update({ tank_id: data.dest_tank_id, updated_at: new Date().toISOString() })
        .eq('linked_brew_id', evt.linked_brew_id)
        .eq('event_type', 'pack')
    }
  }

  revalidatePath('/schedule')
  revalidatePath('/')
}

export async function deleteScheduledBrew(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('scheduled_brews').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/schedule')
  revalidatePath('/')
}
