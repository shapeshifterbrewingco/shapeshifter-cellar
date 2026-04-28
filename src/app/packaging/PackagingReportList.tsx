'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { formatUserName } from '@/lib/utils'
import type { PackagingReportItem } from '@/lib/packaging'

interface Props {
  items: PackagingReportItem[]
}

export function PackagingReportList({ items }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(item =>
      item.beer_name.toLowerCase().includes(q) ||
      (item.batch_code ?? '').toLowerCase().includes(q) ||
      (item.style ?? '').toLowerCase().includes(q) ||
      item.tank_name.toLowerCase().includes(q)
    )
  }, [items, search])

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">No packaging runs recorded yet.</p>
      </div>
    )
  }

  return (
    <>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, batch code, style or tank…"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No results for "{search}"</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((item) => {
          const isOpen = expanded === item.brew_id
          const latestRun = item.runs[0]

          return (
            <div key={item.brew_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Summary row */}
              <button
                type="button"
                className="w-full flex items-center gap-4 px-5 py-4 text-left"
                onClick={() => setExpanded(isOpen ? null : item.brew_id)}
              >
                <span className="text-gray-400 flex-shrink-0">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>

                <div className="flex-shrink-0 w-16 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {item.tank_name}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.beer_name}</p>
                    {item.batch_code && (
                      <span className="text-[10px] font-medium text-gray-400 tabular-nums flex-shrink-0">{item.batch_code}</span>
                    )}
                  </div>
                  {item.style && <p className="text-xs text-gray-400 truncate">{item.style}</p>}
                </div>

                {/* ABV */}
                <div className="flex-shrink-0 text-right w-20 hidden sm:block">
                  {item.abv != null
                    ? <p className="text-xs font-semibold text-indigo-600 tabular-nums">{item.abv.toFixed(1)}% ABV</p>
                    : null}
                  {item.og_plato != null && (
                    <p className="text-xs text-gray-400 tabular-nums">OG {item.og_plato}°P</p>
                  )}
                </div>

                {/* Total volume */}
                <div className="flex-shrink-0 text-right w-20 hidden md:block">
                  <p className="text-xs font-semibold text-gray-700 tabular-nums">{item.total_volume_l.toFixed(1)}L total</p>
                  <p className="text-xs text-gray-400">{item.runs.length} run{item.runs.length !== 1 ? 's' : ''}</p>
                </div>

                {/* Latest packaging date */}
                <div className="flex-shrink-0 text-right w-28 hidden lg:block">
                  <p className="text-xs text-gray-500">
                    {latestRun ? format(parseISO(latestRun.packaged_at), 'd MMM yyyy') : '—'}
                  </p>
                  <p className="text-[10px] text-gray-400">last packaged</p>
                </div>

                <span className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#09434d]/10 text-[#09434d]">
                  Packaged
                </span>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/40 space-y-4">
                  {/* Key stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Brew Day', value: format(parseISO(item.brew_day), 'd MMM yyyy') },
                      { label: 'OG', value: item.og_plato != null ? `${item.og_plato}°P` : '—' },
                      { label: 'FG', value: item.final_plato != null ? `${item.final_plato}°P` : '—' },
                      { label: 'ABV', value: item.abv != null ? `${item.abv.toFixed(1)}%` : '—', accent: true },
                    ].map(({ label, value, accent }) => (
                      <div key={label} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className={`text-sm font-semibold mt-0.5 tabular-nums ${accent ? 'text-indigo-600' : 'text-gray-800'}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Runs table */}
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Date</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Format</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-400">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-400">Volume</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">By</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.runs.map((run) => (
                          <tr key={run.id} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                              {format(parseISO(run.packaged_at), 'd MMM yyyy')}
                            </td>
                            <td className="px-3 py-1.5 text-gray-700">{run.format_label}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{run.qty}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{run.volume_l.toFixed(1)}L</td>
                            <td className="px-3 py-1.5 text-gray-400">{formatUserName(run.packaged_by)}</td>
                            <td className="px-3 py-1.5 text-gray-400">{run.notes ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-100">
                        <tr>
                          <td colSpan={3} className="px-3 py-1.5 text-gray-400 font-medium">Total</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-700">
                            {item.total_volume_l.toFixed(1)}L
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
