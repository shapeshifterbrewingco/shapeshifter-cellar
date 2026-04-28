'use client'

import { useState, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { logGravityReading } from '@/app/brews/actions'
import type { Brew, Tank } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  currentUser: string
  onClose: () => void
}

export function LogReadingModal({ brew, tank, currentUser, onClose }: Props) {
  const [plato, setPlato] = useState('')
  const [ph, setPh] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!plato && !ph) { setError('Enter at least a Plato or pH reading.'); return }
    setError(null)
    startTransition(async () => {
      try {
        await logGravityReading({
          brew_id: brew.id,
          tank_id: tank.id,
          plato: plato ? parseFloat(plato) : null,
          ph: ph ? parseFloat(ph) : null,
          notes,
          recorded_by: currentUser,
        })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save reading.')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Log Reading — {tank.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{brew.beer_name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Gravity (°Plato)</label>
              <input
                autoFocus
                type="number"
                step="0.1"
                min="0"
                max="30"
                value={plato}
                onChange={(e) => setPlato(e.target.value)}
                placeholder="e.g. 8.5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">pH</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="14"
                value={ph}
                onChange={(e) => setPh(e.target.value)}
                placeholder="e.g. 4.3"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          {brew.og_plato && plato && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              OG {brew.og_plato}°P → {plato}°P current
              {/* TODO: ABV = (76.08 * (OG - FG) / (1.775 - OG)) * (FG / 0.794) — add once attenuation confirmed */}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
              Save Reading
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
