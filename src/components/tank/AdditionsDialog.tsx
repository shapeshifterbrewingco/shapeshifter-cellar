'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'
import { recordAddition } from '@/app/brews/sheet-actions'
import type { AdditionStatus } from '@/lib/brew-sheet'

/** What still has to go into a beer, as a pill for its tank card. Null when it has no additions. */
export function additionsLabel(a: AdditionStatus | null | undefined): { text: string; className: string } | null {
  if (!a) return null
  if (a.todo === 0) return { text: 'Additions done', className: 'bg-water/40 text-hops border-water' }
  return {
    text: `${a.hopsOrFruitToGo ? 'Dry hop due' : 'Additions due'} · ${a.todo}`,
    className: 'bg-malt/20 text-malt-dark border-malt/40',
  }
}

/**
 * Tick off dry hops, fruit and cellar additions without opening the brew
 * sheet. Each tick is saved to the sheet straight away.
 */
export function AdditionsDialog({ brewId, beer, tank, additions, onClose }: {
  brewId: string; beer: string; tank: string; additions: AdditionStatus; onClose: () => void
}) {
  const [lines, setLines] = useState(additions.lines)
  const [, startTransition] = useTransition()

  function toggle(index: number) {
    const line = lines.find((l) => l.index === index)
    if (!line) return
    const done = !line.done
    // Unticking is rare and worth a pause; ticking is the whole point
    if (!done && !window.confirm(`Mark ${line.name} as not added?`)) return
    setLines((ls) => ls.map((l) => (l.index === index ? { ...l, done } : l)))
    startTransition(async () => {
      const res = await recordAddition({ brew_id: brewId, index, name: line.name, done }).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
      if (!res.ok) {
        setLines((ls) => ls.map((l) => (l.index === index ? { ...l, done: !done } : l)))
        toast.error(res.message)
      } else if (done) toast.success(`${line.name} recorded for ${tank}`)
    })
  }

  const left = lines.filter((l) => !l.done).length

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Additions for ${beer}`}
        className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-8 sm:pb-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-gray-400">{tank}</p>
            <h2 className="text-lg font-semibold text-gray-900 break-words">{beer}</h2>
            <p className="text-sm text-gray-500">{left === 0 ? 'All additions done' : `${left} to go. Tap one when it has gone in.`}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 flex-shrink-0 flex items-center justify-center text-gray-400"><X className="h-5 w-5" /></button>
        </div>

        <ul className="mt-4 space-y-2">
          {lines.map((l) => (
            <li key={l.index}>
              <button type="button" onClick={() => toggle(l.index)} aria-pressed={l.done}
                className={`w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left ${l.done ? 'bg-water/25 border-transparent' : 'bg-white border-gray-200 active:bg-gray-50'}`}>
                <span className={`h-9 w-9 flex-shrink-0 rounded-lg border flex items-center justify-center ${l.done ? 'bg-hops border-hops text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                  <Check className="h-5 w-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-medium text-gray-900 break-words">{l.name}</span>
                  <span className="block text-xs text-gray-500">{[l.amount, l.when].filter(Boolean).join(' · ') || 'No amount on the recipe'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Link href={`/brews/${brewId}/sheet`} className="mt-4 block text-center text-sm font-semibold text-primary">Open the brew sheet to change amounts or add a line</Link>
      </div>
    </div>,
    document.body,
  )
}
