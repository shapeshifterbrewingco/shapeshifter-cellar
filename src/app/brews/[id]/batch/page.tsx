import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BatchForm } from './BatchForm'

export const dynamic = 'force-dynamic'

// Set a brew's batch number. Linked from Life OS when a carton sticker needs one.
export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: brew }, { data: recent }] = await Promise.all([
    supabase.from('brews').select('id, beer_name, brew_day, batch_code, stage, tanks(name)').eq('id', id).maybeSingle(),
    supabase.from('brews').select('beer_name, brew_day, batch_code').not('batch_code', 'is', null).order('brew_day', { ascending: false }).limit(3),
  ])
  if (!brew) notFound()
  const tank = Array.isArray(brew.tanks) ? brew.tanks[0]?.name : (brew.tanks as { name: string } | null)?.name
  const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 md:px-6 py-5 max-w-md mx-auto">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft className="h-4 w-4" />Cellar</Link>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{brew.beer_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Brewed {day(brew.brew_day)}{tank ? `, ${tank}` : ''}</p>
        <BatchForm brewId={brew.id} initial={brew.batch_code ?? ''} />
        {recent && recent.length > 0 && (
          <div className="mt-6 text-sm text-gray-500">
            <p className="font-medium text-gray-700">Recent batch numbers</p>
            <ul className="mt-1 space-y-0.5">
              {recent.map((r) => <li key={`${r.batch_code}-${r.brew_day}`}>{r.batch_code}: {r.beer_name}, {day(r.brew_day)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}
