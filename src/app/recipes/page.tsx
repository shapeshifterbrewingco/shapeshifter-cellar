import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getRecipes } from '@/lib/recipes'
import { Plus } from 'lucide-react'
import { RecipeList } from './RecipeList'

export default async function RecipesPage() {
  const supabase = await createClient()
  const recipes = await getRecipes(supabase)

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-gray-900">Recipes</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/recipes/import"
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Import from PDF
            </Link>
            <Link
              href="/recipes/new"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="h-4 w-4" />
              New Recipe
            </Link>
          </div>
        </div>

        {recipes.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
            <p className="text-gray-500 text-sm">No recipes yet.</p>
            <Link href="/recipes/new" className="mt-3 inline-block text-primary text-sm font-medium hover:underline">
              Create your first recipe →
            </Link>
          </div>
        ) : (
          <RecipeList recipes={recipes} />
        )}
      </div>
    </main>
  )
}
