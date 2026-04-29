'use client'

import { useState, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { assignBrew } from '@/app/brews/actions'
import type { Tank } from '@/types'

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
  onClose: () => void
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function AssignBrewModal({ tank, recipes, defaultVolumeL, onClose }: Props) {
  const [recipeId, setRecipeId] = useState('')
  const [beerName, setBeerName] = useState('')
  const [style, setStyle] = useState('')
  const [brewDay, setBrewDay] = useState(today())
  const [volumeL, setVolumeL] = useState(defaultVolumeL != null ? String(defaultVolumeL) : '')
  const [ogPlato, setOgPlato] = useState('')
  const [ph, setPh] = useState('5.4')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleRecipeChange(id: string) {
    setRecipeId(id)
    const recipe = recipes.find((r) => r.id === id)
    if (recipe) {
      setBeerName(recipe.name)
      setStyle(recipe.style ?? '')
      if (recipe.target_og_plato != null) setOgPlato(String(recipe.target_og_plato))
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
        await assignBrew({
          tank_id: tank.id,
          recipe_id: recipeId || null,
          beer_name: beerName,
          style: style || null,
          brew_day: brewDay,
          volume_l: parseFloat(volumeL),
          og_plato: ogPlato ? parseFloat(ogPlato) : null,
          initial_ph: ph ? parseFloat(ph) : null,
          notes,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to assign brew.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Start Brew — {tank.name}</h2>
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Brew day</label>
              <input
                type="date"
                value={brewDay}
                onChange={(e) => setBrewDay(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Volume (L) <span className="text-red-400">*</span></label>
              <input
                type="number"
                step="any"
                min="0"
                value={volumeL}
                onChange={(e) => setVolumeL(e.target.value)}
                placeholder="2800"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          {/* OG + pH */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">OG (°Plato)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={ogPlato}
                onChange={(e) => setOgPlato(e.target.value)}
                placeholder="e.g. 16.5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Initial pH</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                placeholder="e.g. 5.2"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

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
              Assign to {tank.name}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
