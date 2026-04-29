import { createClient } from '@/lib/supabase/server'
import { getPackagingReport } from '@/lib/reports'
import { PackagingReport } from './PackagingReport'

export default async function ReportsPage() {
  const supabase = await createClient()
  const initialData = await getPackagingReport(supabase, 'this_month')

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Volume packed by beer and format across time periods</p>
        </div>
        <PackagingReport initialPeriod="this_month" initialData={initialData} />
      </div>
    </main>
  )
}
