import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getRecipe } from '@/lib/recipes'
import { getStyleColour, ADDITION_STAGE_LABELS, ADDITION_STAGE_ORDER } from '@/types'
import { deleteRecipe } from '@/app/recipes/actions'
import { DeleteButton } from './DeleteButton'

interface Props {
  params: Promise<{ id: string }>
}

export default async function RecipeDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const recipe = await getRecipe(supabase, id)
  if (!recipe) notFound()

  const ingredients = recipe.ingredients ?? []

  return (
    <main className="min-h-screen bg-background text-foreground">

      <div className="px-6 py-6 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/recipes" className="hover:text-primary">Recipes</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{recipe.name}</span>
        </div>

        {/* Page header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              {recipe.style && (
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getStyleColour(recipe.style) }}
                />
              )}
              <h1 className="text-2xl font-bold text-gray-900">{recipe.name}</h1>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">v{recipe.version}</span>
            </div>
            {recipe.style && <p className="text-sm text-gray-500 mt-1">{recipe.style}</p>}
          </div>
          <div className="flex items-center gap-2">
            <DeleteButton recipeId={recipe.id} deleteAction={deleteRecipe} />
            <Link
              href={`/recipes/${recipe.id}/edit`}
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left: targets + process */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Targets</h2>
              <div className="grid grid-cols-5 gap-4">
                <Stat label="ABV" value={recipe.target_abv != null ? `${recipe.target_abv}%` : null} />
                <Stat label="OG" value={recipe.target_og_plato != null ? `${recipe.target_og_plato}°P` : null} />
                <Stat label="FG" value={recipe.target_fg_plato != null ? `${recipe.target_fg_plato}°P` : null} />
                <Stat label="IBU" value={recipe.target_ibu?.toString() ?? null} />
                <Stat label="EBC" value={recipe.target_ebc?.toString() ?? null} />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Process</h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <StatRow label="Brew Volume" value={recipe.brew_volume_l != null ? `${recipe.brew_volume_l} L` : null} />
                <StatRow label="Foundation" value={recipe.foundation_l != null ? `${recipe.foundation_l} L` : null} />
                <StatRow label="Sparge" value={recipe.sparge_l != null ? `${recipe.sparge_l} L` : null} />
                <StatRow label="Boil Duration" value={recipe.boil_duration_min != null ? `${recipe.boil_duration_min} min` : null} />
                <StatRow label="Mash Temp" value={recipe.mash_temp_c != null ? `${recipe.mash_temp_c}°C` : null} />
                <StatRow label="Pitch Temp" value={recipe.pitch_temp_c != null ? `${recipe.pitch_temp_c}°C` : null} />
                <StatRow label="Ferment Temp" value={recipe.ferment_temp_c != null ? `${recipe.ferment_temp_c}°C` : null} />
              </div>
            </div>

            {recipe.notes && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{recipe.notes}</p>
              </div>
            )}
          </div>

          {/* Right: ingredients */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Ingredients</h2>
            {ingredients.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No ingredients added.</p>
            ) : (
              <div className="space-y-4">
                {ADDITION_STAGE_ORDER.map((stage) => {
                  const rows = ingredients.filter((i) => i.addition_stage === stage)
                  if (rows.length === 0) return null
                  return (
                    <div key={stage}>
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        {ADDITION_STAGE_LABELS[stage]}
                      </h3>
                      <table className="w-full text-sm">
                        <tbody>
                          {rows.map((ing) => (
                            <tr key={ing.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-1.5 text-gray-800">{ing.name}</td>
                              <td className="py-1.5 text-right tabular-nums text-gray-600 w-20">
                                {ing.quantity != null ? ing.quantity : ''}
                                {ing.unit ? ` ${ing.unit}` : ''}
                              </td>
                              <td className="py-1.5 text-right text-gray-400 text-xs w-16">
                                {ing.time_minutes != null ? `${ing.time_minutes} min` : ''}
                                {ing.trigger ?? ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-base font-semibold text-gray-900">{value ?? <span className="text-gray-300">—</span>}</p>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value ?? <span className="text-gray-300">—</span>}</span>
    </div>
  )
}
