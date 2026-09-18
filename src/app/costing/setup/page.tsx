import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSettings } from '@/app/settings/actions'
import { getMaterials, getAdditives, getIngredientOptions } from './actions'
import { SetupView } from './SetupView'

export default async function CostSetupPage() {
  const [materials, additives, ingredients, settings] = await Promise.all([
    getMaterials(), getAdditives(), getIngredientOptions(), getSettings(),
  ])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-4xl mx-auto">
        <Link href="/costing" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
          <ArrowLeft className="h-3.5 w-3.5" />
          Costing
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Cost setup</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Everything the per-unit cost is built from, other than the recipe itself.
          </p>
        </div>

        <SetupView
          materials={materials}
          additives={additives}
          ingredients={ingredients}
          settings={settings}
        />
      </div>
    </main>
  )
}
