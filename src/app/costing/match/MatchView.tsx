'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Wand2, X, Search } from 'lucide-react'
import { formatMoney } from '@/lib/costing'
import { linkIngredient, autoLinkConfident } from '../match-actions'
import type { UnmatchedRow } from '../match-actions'

type Filter = 'todo' | 'linked' | 'all'

export function MatchView({ rows }: { rows: UnmatchedRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('todo')
  const [query, setQuery] = useState('')
  const [busy, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)

  const counts = useMemo(() => ({
    todo: rows.filter((r) => !r.linkedId).length,
    linked: rows.filter((r) => r.linkedId).length,
    confident: rows.filter((r) => !r.linkedId && r.confident).length,
  }), [rows])

  const visible = rows.filter((r) => {
    if (filter === 'todo' && r.linkedId) return false
    if (filter === 'linked' && !r.linkedId) return false
    if (query && !`${r.name} ${r.recipeName}`.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  function handleAutoLink() {
    startTransition(async () => {
      const res = await autoLinkConfident()
      setMessage(`Linked ${res.linked}. ${res.remaining} still need a choice.`)
      router.refresh()
    })
  }

  function link(rowId: string, ingredientId: string | null) {
    startTransition(async () => {
      await linkIngredient(rowId, ingredientId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">

      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(['todo', 'linked', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {f === 'todo' ? `To link (${counts.todo})` : f === 'linked' ? `Linked (${counts.linked})` : 'All'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="h-3.5 w-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm"
          />
        </div>

        <button
          onClick={handleAutoLink}
          disabled={busy || counts.confident === 0}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
        >
          <Wand2 className="h-3 w-3" />
          Auto-link {counts.confident} exact match{counts.confident === 1 ? '' : 'es'}
        </button>
      </div>

      {message && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{message}</p>
      )}

      {visible.length === 0 && (
        <p className="text-sm text-gray-400 py-8 text-center">Nothing here.</p>
      )}

      <div className="space-y-2">
        {visible.map((r) => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <div>
                <span className="text-sm font-semibold text-gray-900">{r.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  {r.recipeName}
                  {r.quantity != null && ` · ${r.quantity} ${r.unit ?? ''}`}
                  {r.category && ` · ${r.category}`}
                </span>
              </div>

              {r.linkedId && (
                <button
                  onClick={() => link(r.id, null)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                  Unlink
                </button>
              )}
            </div>

            {r.linkedId ? (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-800">{r.linkedName}</span>
                <span className="text-xs text-gray-400">
                  {r.linkedPrice != null
                    ? `${formatMoney(r.linkedPrice)}/${r.linkedUnit}`
                    : 'no price on file'}
                </span>
              </div>
            ) : r.candidates.length === 0 ? (
              <p className="text-xs text-gray-400">
                No priced product looks like this. Import a price list that carries it, or add it to
                the ingredient library.
              </p>
            ) : (
              <div className="space-y-1">
                {r.candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => link(r.id, c.id)}
                    disabled={busy}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg border border-gray-100 hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <span className="text-sm text-gray-800 truncate">{c.name}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-2">
                      {c.supplier}
                      <span className="tabular-nums text-gray-600 font-medium">
                        {c.pricePerUnit != null ? `${formatMoney(c.pricePerUnit)}/${c.unit}` : '—'}
                      </span>
                      <span className={`tabular-nums ${c.score >= 0.95 ? 'text-green-600' : 'text-gray-300'}`}>
                        {(c.score * 100).toFixed(0)}%
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
