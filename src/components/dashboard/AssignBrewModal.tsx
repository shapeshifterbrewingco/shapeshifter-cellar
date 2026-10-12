'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { assignBrew } from '@/app/brews/actions'
import type { Tank } from '@/types'
import { breweryToday } from '@/lib/dates'

export interface RecipeOption {
  id: string
  name: string
  style: string | null
  target_og_plato: number | null
  brew_volume_l: number | null
}

interface Props {
  tank: Tank
  recipes: RecipeOption[]
  defaultVolumeL?: number | null
  /** The brew booked for this tank on the calendar, e.g. "Party Shirt KEGS (PROPOSED)". Pre-fills the form. */
  plannedName?: string | null
  onClose: () => void
}

const today = () => breweryToday()

/**
 * A calendar title carries planning shorthand after the beer name: the pack
 * format and whether it is confirmed. "Party Shirt KEGS (PROPOSED)" is a brew
 * of Party Shirt.
 */
function beerFromPlan(title: string | null | undefined): string {
  if (!title) return ''
  return title
    .replace(/\((proposed|tbc|tentative)\)/gi, ' ')
    .replace(/\b(kegs?|cans?|cartons?|split|only)\b\s*$/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s-]+$/, '')
    .trim()
}

export function AssignBrewModal({ tank, recipes, defaultVolumeL, plannedName, onClose }: Props) {
  // Start from what the calendar says is going in this tank. Everything stays
  // editable: the plan is a starting point, not a lock.
  const planned = beerFromPlan(plannedName)
  const plannedRecipe = (() => {
    if (!planned) return null
    const want = planned.toLowerCase()
    const exact = recipes.find((r) => r.name.toLowerCase() === want)
    if (exact) return exact
    // The calendar shortens names ("Findon's" for Findon's Finest). Take a
    // recipe that starts the same way only if exactly one does.
    const starts = want.length >= 4 ? recipes.filter((r) => r.name.toLowerCase().startsWith(want)) : []
    if (starts.length === 1) return starts[0]
    // The calendar also pads names ("Big chonky fruited sour", "Divide by Zero
    // 2027"). Take the recipe whose every word appears in the title, again
    // only if exactly one does.
    const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').split(/\s+/).filter(Boolean)
    const have = new Set(words(want))
    const within = recipes.filter((r) => { const w = words(r.name); return w.length > 0 && w.every((x) => have.has(x)) })
    return within.length === 1 ? within[0] : null
  })()

  const [recipeId, setRecipeId] = useState(plannedRecipe?.id ?? '')
  const [beerName, setBeerName] = useState(plannedRecipe?.name ?? planned)
  const [style, setStyle] = useState(plannedRecipe?.style ?? '')
  const [brewDay, setBrewDay] = useState(today())
  const [volumeL, setVolumeL] = useState(
    plannedRecipe?.brew_volume_l != null ? String(plannedRecipe.brew_volume_l)
      : defaultVolumeL != null ? String(defaultVolumeL) : ''
  )
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleRecipeChange(id: string) {
    setRecipeId(id)
    const recipe = recipes.find((r) => r.id === id)
    if (recipe) {
      setBeerName(recipe.name)
      setStyle(recipe.style ?? '')
      if (recipe.brew_volume_l != null) setVolumeL(String(recipe.brew_volume_l))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!beerName.trim()) { setError('Beer name is required.'); return }
    if (!volumeL || isNaN(parseFloat(volumeL))) { setError('Enter a valid volume.'); return }
    setError(null)
    startTransition(async () => {
      try {
        const result = await assignBrew({
          tank_id: tank.id,
          recipe_id: recipeId || null,
          beer_name: beerName,
          style: style || null,
          brew_day: brewDay,
          volume_l: parseFloat(volumeL),
          og_plato: null,
          initial_ph: null,
          notes,
        })
        if (!result.ok) { setError(result.message); return }
        onClose()
        // Straight into the brew sheet: that is where the day gets recorded
        if (result.id) router.push(`/brews/${result.id}/sheet`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign brew.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Start brew day, {tank.name}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {/* Recipe picker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recipe (optional)</label>
            <select
              value={recipeId}
              onChange={(e) => handleRecipeChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">— No recipe / manual entry —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.style ? ` · ${r.style}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Beer name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Beer name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={beerName}
              onChange={(e) => setBeerName(e.target.value)}
              placeholder="e.g. Golden Ratio"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Style */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Style</label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. Hazy IPA"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Brew day + Volume */}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Brew day</label>
              <input
                type="date"
                value={brewDay}
                onChange={(e) => setBrewDay(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Planned volume (L) <span className="text-red-400">*</span></label>
              <input
                type="number" inputMode="decimal"
                step="any"
                min="0"
                value={volumeL}
                onChange={(e) => setVolumeL(e.target.value)}
                placeholder="2800"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            This opens the brew sheet. Fill it in as the day goes; it saves as you type, so you can close it and come back.
            OG, pH and the final volume go in at the end, under All in FV.
          </p>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional batch notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Start brew day
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
