'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { getStyleColour } from '@/types'
import { RECIPE_TAGS, RECIPE_TAG_LABELS, RECIPE_TAG_COLOURS } from '@/types'
import type { Recipe, RecipeTag } from '@/types'

interface Props {
  recipes: Recipe[]
}

export function RecipeList({ recipes }: Props) {
  const [activeTag, setActiveTag] = useState<RecipeTag | 'all'>('all')

  const filtered = activeTag === 'all'
    ? recipes
    : recipes.filter((r) => r.tag === activeTag)

  return (
    <div>
      {/* Tag filter pills */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTag('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            activeTag === 'all'
              ? 'bg-gray-800 text-white border-gray-800'
              : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          All ({recipes.length})
        </button>
        {RECIPE_TAGS.map((t) => {
          const count = recipes.filter((r) => r.tag === t).length
          if (count === 0) return null
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(activeTag === t ? 'all' : t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                activeTag === t
                  ? RECIPE_TAG_COLOURS[t]
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {RECIPE_TAG_LABELS[t]} ({count})
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
          <p className="text-gray-500 text-sm">No {activeTag !== 'all' ? RECIPE_TAG_LABELS[activeTag] + ' ' : ''}recipes yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Style</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tag</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Ver.</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">ABV</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">OG</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">FG</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">IBU</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Vol (L)</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((recipe, i) => (
                <tr
                  key={recipe.id}
                  className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                >
                  <td className="px-4 py-3">
                    <Link href={`/recipes/${recipe.id}`} className="font-medium text-gray-900 hover:text-primary">
                      {recipe.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {recipe.style ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: getStyleColour(recipe.style) }}
                        />
                        <span className="text-gray-700">{recipe.style}</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {recipe.tag ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border ${RECIPE_TAG_COLOURS[recipe.tag]}`}>
                        {RECIPE_TAG_LABELS[recipe.tag]}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                      v{recipe.version}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {recipe.target_abv != null ? `${recipe.target_abv}%` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {recipe.target_og_plato != null ? `${recipe.target_og_plato}°P` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {recipe.target_fg_plato != null ? `${recipe.target_fg_plato}°P` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {recipe.target_ibu != null ? recipe.target_ibu : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                    {recipe.brew_volume_l != null ? recipe.brew_volume_l.toLocaleString() : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/recipes/${recipe.id}/edit`}
                      className="inline-flex items-center justify-center p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-md transition-colors"
                      title="Edit recipe"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
