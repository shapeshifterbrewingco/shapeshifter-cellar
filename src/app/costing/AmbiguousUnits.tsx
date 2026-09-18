'use client'

import { useState, useEffect, useTransition } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { getAmbiguousUnits, resolveAmbiguousUnits } from './actions'
import type { AmbiguousLine } from './actions'

/**
 * Brew sheets head a column "G/KG", meaning the number is in grams or
 * kilograms. The recipe parser used to take that literally and store "g/kg" as
 * the unit, which cannot be costed. This clears those in one go, proposing the
 * unit the magnitude points to, with a forced option either way.
 */
export function AmbiguousUnits({ recipeId, onResolved }: {
  recipeId: string
  onResolved: () => void
}) {
  const [lines, setLines] = useState<AmbiguousLine[] | null>(null)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    let live = true
    getAmbiguousUnits(recipeId).then((l) => { if (live) setLines(l) })
    return () => { live = false }
  }, [recipeId])

  if (!lines || lines.length === 0) return null

  const units = Array.from(new Set(lines.flatMap((l) => l.unit.split('/').map((u) => u.trim()))))

  function resolve(force?: string) {
    startTransition(async () => {
      await resolveAmbiguousUnits(recipeId, force)
      setLines([])
      onResolved()
    })
  }

  return (
    <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {lines.length} line{lines.length === 1 ? '' : 's'} with an ambiguous unit
      </h3>
      <p className="text-xs text-amber-700 mb-2">
        These came off a brew sheet column headed{' '}
        <code className="font-medium">{lines[0].unit}</code>, so the amount is in one unit or the
        other. Nothing can be costed until it is settled.
      </p>

      <ul className="text-xs text-amber-800 space-y-0.5 mb-3">
        {lines.slice(0, 8).map((l) => (
          <li key={l.id} className="flex items-baseline gap-1.5">
            <span className="text-gray-800">{l.name}</span>
            <span className="tabular-nums text-gray-500">{l.quantity ?? '—'}</span>
            <span className="text-amber-700">
              {l.unit} &rarr; <span className="font-semibold">{l.proposed}</span>
            </span>
          </li>
        ))}
        {lines.length > 8 && <li className="text-amber-600">and {lines.length - 8} more</li>}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => resolve()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Apply these
        </button>
        {units.map((u) => (
          <button
            key={u}
            onClick={() => resolve(u)}
            disabled={busy}
            className="text-xs font-medium border border-amber-300 bg-white text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            Set all to {u}
          </button>
        ))}
      </div>
    </section>
  )
}
