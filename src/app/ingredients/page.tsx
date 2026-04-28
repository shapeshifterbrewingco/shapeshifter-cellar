import { createClient } from '@/lib/supabase/server'
import { getAllIngredientsWithPrices } from '@/lib/ingredients'
import { PriceListImport } from './PriceListImport'
import { IngredientLibrary } from './IngredientLibrary'

export default async function IngredientsPage() {
  const supabase = await createClient()
  const ingredients = await getAllIngredientsWithPrices(supabase)

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        <PriceListImport />
        <IngredientLibrary ingredients={ingredients} />
      </div>
    </main>
  )
}
