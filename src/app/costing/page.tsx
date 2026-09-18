import Link from 'next/link'
import { Settings2, Link2 } from 'lucide-react'
import { getRecipeOptions, getCostingReference, getSplitPrefills } from './actions'
import { CostingCalculator } from './CostingCalculator'

export default async function CostingPage() {
  const [recipes, reference, prefills] = await Promise.all([
    getRecipeOptions(),
    getCostingReference(),
    getSplitPrefills(),
  ])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Recipe Costing</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cost per can, per carton and per keg from live supplier prices
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/costing/match"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <Link2 className="h-3.5 w-3.5" />
              Link ingredients
            </Link>
            <Link
              href="/costing/setup"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Cost setup
            </Link>
          </div>
        </div>

        <CostingCalculator recipes={recipes} reference={reference} prefills={prefills} />
      </div>
    </main>
  )
}
