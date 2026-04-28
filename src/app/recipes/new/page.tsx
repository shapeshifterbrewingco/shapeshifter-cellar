import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBeerStyles, getAllIngredients } from '@/lib/ingredients'
import { RecipeForm } from '@/components/recipes/RecipeForm'

export default async function NewRecipePage() {
  const supabase = await createClient()
  const [styles, ingredients] = await Promise.all([
    getBeerStyles(supabase),
    getAllIngredients(supabase),
  ])

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/recipes" className="hover:text-primary">Recipes</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">New Recipe</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-6">New Recipe</h1>
        <RecipeForm styles={styles} ingredients={ingredients} />
      </div>
    </main>
  )
}
