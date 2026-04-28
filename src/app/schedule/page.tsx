import { createClient } from '@/lib/supabase/server'
import { ScheduleView } from './ScheduleView'
import type { ScheduledBrew } from '@/types'

export const revalidate = 0

export default async function SchedulePage() {
  const supabase = await createClient()

  const [{ data: brews, error: brewsError }, { data: recipes }, { data: tanks }] = await Promise.all([
    supabase
      .from('scheduled_brews')
      .select('*, recipe:recipes(id, name, style), tank:tanks!tank_id(id, name), dest_tank:tanks!dest_tank_id(id, name)')
      .order('scheduled_date')
      .order('event_type'),
    supabase
      .from('recipes')
      .select('id, name, style')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('tanks')
      .select('id, name')
      .order('name'),
  ])

  if (brewsError) console.error('scheduled_brews query error:', brewsError)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-gray-900">Brew Schedule</h1>
        </div>
        <ScheduleView
          brews={(brews ?? []) as ScheduledBrew[]}
          recipes={recipes ?? []}
          tanks={tanks ?? []}
        />
      </div>
    </main>
  )
}
