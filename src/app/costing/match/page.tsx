import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getMatchRows } from '../match-actions'
import { MatchView } from './MatchView'

export default async function MatchPage() {
  const rows = await getMatchRows()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <Link href="/costing" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
          <ArrowLeft className="h-3.5 w-3.5" />
          Costing
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Link ingredients to prices</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            A recipe line only carries a cost once it points at a priced product. Suggestions are
            ranked, but the choice is yours: the same hop can appear as pellets, cryo or extract at
            very different prices.
          </p>
        </div>

        <MatchView rows={rows} />
      </div>
    </main>
  )
}
