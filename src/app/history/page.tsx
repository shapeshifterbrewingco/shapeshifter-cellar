import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBrewHistory } from '@/lib/history'
import { HistoryList } from './HistoryList'
import { ReadingsList } from '@/app/readings/ReadingsList'
import type { ReadingRow } from '@/app/readings/ReadingsList'

type View = 'batches' | 'readings'

// History holds everything that has already happened: finished batches, and
// the full log of readings across every beer, in tank or not.
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const view: View = (await searchParams).view === 'readings' ? 'readings' : 'batches'
  const supabase = await createClient()

  const tab = (v: View, label: string) => (
    <Link
      href={v === 'batches' ? '/history' : '/history?view=readings'}
      aria-current={view === v ? 'page' : undefined}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        <nav className="inline-flex gap-1 p-1 mb-5 rounded-xl bg-gray-200/60" aria-label="History views">
          {tab('batches', 'Batches')}
          {tab('readings', 'Readings')}
        </nav>

        {view === 'batches' ? <Batches supabase={supabase} /> : <Readings supabase={supabase} />}
      </div>
    </main>
  )
}

type Db = Awaited<ReturnType<typeof createClient>>

async function Batches({ supabase }: { supabase: Db }) {
  const items = await getBrewHistory(supabase)
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-black text-gray-900">Brew History</h1>
        <p className="text-sm text-gray-500 mt-0.5">{items.length} completed batch{items.length !== 1 ? 'es' : ''}</p>
      </div>
      <HistoryList items={items} />
    </>
  )
}

async function Readings({ supabase }: { supabase: Db }) {
  const { data: rows, error } = await supabase
    .from('gravity_readings')
    .select('id, recorded_at, plato, ph, temperature_c, recorded_by, notes, brews(beer_name, tanks(name))')
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
      temperature_c: r.temperature_c,
      recorded_by: r.recorded_by,
      notes: r.notes,
      tank_name: tank?.name ?? '—',
      beer_name: brew?.beer_name ?? '—',
    }
  })

  return <ReadingsList readings={readings} />
}
