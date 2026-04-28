import { createClient } from '@/lib/supabase/server'
import { ReadingsList } from './ReadingsList'
import type { ReadingRow } from './ReadingsList'

export default async function ReadingsPage() {
  const supabase = await createClient()

  const { data: rows, error } = await supabase
    .from('gravity_readings')
    .select('id, recorded_at, plato, ph, recorded_by, notes, brews(beer_name, tanks(name))')
    .order('recorded_at', { ascending: false })
    .limit(500)

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readings: ReadingRow[] = ((rows ?? []) as any[]).map(r => {
    const brew = Array.isArray(r.brews) ? r.brews[0] : r.brews
    const tank = Array.isArray(brew?.tanks) ? brew.tanks[0] : brew?.tanks
    return {
      id: r.id,
      recorded_at: r.recorded_at,
      plato: r.plato,
      ph: r.ph,
      recorded_by: r.recorded_by,
      notes: r.notes,
      tank_name: tank?.name ?? '—',
      beer_name: brew?.beer_name ?? '—',
    }
  })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <ReadingsList readings={readings} />
      </div>
    </main>
  )
}
