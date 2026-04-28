import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRecipe } from '@/lib/recipes'
import { getBeerStyles, getAllIngredients } from '@/lib/ingredients'
import { RecipeForm } from '@/components/recipes/RecipeForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditRecipePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const [recipe, styles, ingredients] = await Promise.all([
    getRecipe(supabase, id),
    getBeerStyles(supabase),
    getAllIngredients(supabase),
  ])
  if (!recipe) notFound()

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/recipes" className="hover:text-primary">Recipes</Link>
          <span>/</span>
          <Link href={`/recipes/${recipe.id}`} className="hover:text-primary">{recipe.name}</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">Edit</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-6">Edit Recipe</h1>
        <RecipeForm recipe={recipe} styles={styles} ingredients={ingredients} />
      </div>
    </main>
  )
}
