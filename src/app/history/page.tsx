import { createClient } from '@/lib/supabase/server'
import { getBrewHistory } from '@/lib/history'
import { HistoryList } from './HistoryList'

export default async function HistoryPage() {
  const supabase = await createClient()
  const items = await getBrewHistory(supabase)

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Brew History</h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} completed batch{items.length !== 1 ? 'es' : ''}</p>
          </div>
        </div>

        <HistoryList items={items} />
      </div>
    </main>
  )
}
