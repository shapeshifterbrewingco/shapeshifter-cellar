import { createClient } from '@/lib/supabase/server'
import { getPackagingReports } from '@/lib/packaging'
import { PackagingReportList } from './PackagingReportList'

export default async function PackagingPage() {
  const supabase = await createClient()
  const items = await getPackagingReports(supabase)

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Packaging</h1>
            <p className="text-sm text-gray-500 mt-0.5">{items.length} batch{items.length !== 1 ? 'es' : ''} packaged</p>
          </div>
        </div>
        <PackagingReportList items={items} />
      </div>
    </main>
  )
}
