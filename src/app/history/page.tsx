import { createClient } from '@/lib/supabase/server'
import { getBrewHistory, getPackedRuns } from '@/lib/history'
import { HistoryList } from './HistoryList'
import { HistoryTop } from './HistoryTop'

export default async function HistoryPage() {
  const supabase = await createClient()
  const [items, runs] = await Promise.all([getBrewHistory(supabase), getPackedRuns(supabase)])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 md:px-6 py-5 max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">History</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} finished batch{items.length !== 1 ? 'es' : ''}, with what each one packed</p>
        </div>

        <HistoryList items={items} top={<HistoryTop runs={runs} items={items} />} />
      </div>
    </main>
  )
}
