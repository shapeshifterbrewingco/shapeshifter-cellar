'use client'

import { useState, useEffect, useTransition } from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { getAmbiguousUnits, resolveAmbiguousUnits } from './actions'
import type { AmbiguousLine } from './actions'

const optionsOf = (unit: string) => unit.split('/').map((u) => u.trim()).filter(Boolean)

/**
 * Brew sheets head a column "G/KG", meaning the number is in grams or
 * kilograms. The recipe parser used to take that literally and store "g/kg" as
 * the unit, which cannot be costed. Each line here starts on the unit its size
 * and type point to, and a person confirms or flips every one before anything
 * is saved: a wrong guess is a thousand-fold error in that line's cost.
 */
export function AmbiguousUnits({ recipeId, onResolved }: {
  recipeId: string
  onResolved: () => void
}) {
  const [lines, setLines] = useState<AmbiguousLine[] | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  useEffect(() => {
    let live = true
    getAmbiguousUnits(recipeId).then((l) => {
      if (!live) return
      setLines(l)
      setChoices(Object.fromEntries(l.map((x) => [x.id, x.proposed])))
    })
    return () => { live = false }
  }, [recipeId])

  if (!lines || lines.length === 0) return null

  const units = Array.from(new Set(lines.flatMap((l) => optionsOf(l.unit))))
  const setAll = (u: string) =>
    setChoices((c) => Object.fromEntries(lines.map((l) => [l.id, optionsOf(l.unit).includes(u) ? u : c[l.id]])))

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await resolveAmbiguousUnits(recipeId, choices)
      } catch {
        setError('Those did not save. Try again.')
        return
      }
      setLines([])
      onResolved()
    })
  }

  return (
    <section className="bg-yeast/30 border border-yeast rounded-xl p-4">
      <h3 className="text-xs font-semibold text-charcoal uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        {lines.length} line{lines.length === 1 ? '' : 's'} with an ambiguous unit
      </h3>
      <p className="text-xs text-charcoal mb-2">
        These came off a brew sheet column headed{' '}
        <code className="font-medium">{lines[0].unit}</code>, so the amount is in one unit or the
        other. Check each one: the highlighted unit is only a guess.
      </p>

      <ul className="text-xs space-y-1 mb-3">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <span className="text-gray-800 flex-1 min-w-0 truncate">{l.name}</span>
            <span className="tabular-nums text-gray-600 w-14 text-right">{l.quantity ?? '-'}</span>
            <span className="inline-flex rounded-lg border border-yeast overflow-hidden bg-white">
              {optionsOf(l.unit).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setChoices((c) => ({ ...c, [l.id]: u }))}
                  className={`px-2.5 py-1 font-medium ${choices[l.id] === u ? 'bg-primary text-primary-foreground' : 'text-charcoal hover:bg-yeast/30'}`}
                >
                  {u}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Save these units
        </button>
        {units.map((u) => (
          <button
            key={u}
            onClick={() => setAll(u)}
            disabled={busy}
            className="text-xs font-medium border border-yeast bg-white text-charcoal px-3 py-1.5 rounded-lg hover:bg-yeast/30 disabled:opacity-50"
          >
            Mark all as {u}
          </button>
        ))}
      </div>
    </section>
  )
}
