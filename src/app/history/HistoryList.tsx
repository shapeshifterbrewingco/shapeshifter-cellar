'use client'

import { useState, useTransition, useMemo } from 'react'
import { ChevronDown, ChevronRight, Package, Pencil, Trash2, Search } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { deleteBrewHistory } from './actions'
import { EditBrewModal } from './EditBrewModal'
import type { BrewHistoryItem } from '@/lib/history'
import { PACKAGE_FORMATS } from '@/types'
import { formatUserName } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  transferred: 'Transferred',
  packaged: 'Packaged',
  cleaning: 'CIP',
}

const STAGE_COLOURS: Record<string, string> = {
  transferred: 'bg-blue-50 text-blue-600',
  packaged: 'bg-[#09434d]/10 text-[#09434d]',
  cleaning: 'bg-orange-50 text-orange-600',
}

interface Props {
  items: BrewHistoryItem[]
}

export function HistoryList({ items }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<BrewHistoryItem | null>(null)
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()

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

  function handleDelete(item: BrewHistoryItem) {
    if (!confirm(`Permanently delete "${item.beer_name}"${item.batch_code ? ` (${item.batch_code})` : ''}? This cannot be undone.`)) return
    startTransition(() => deleteBrewHistory(item.id))
    if (expanded === item.id) setExpanded(null)
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">No completed brews yet.</p>
      </div>
    )
  }

  return (
    <>
      {/* Search */}
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
          const isOpen = expanded === item.id
          const days = differenceInDays(parseISO(item.completed_at), parseISO(item.brew_day))
          const stageColour = STAGE_COLOURS[item.stage] ?? 'bg-gray-100 text-gray-500'
          const stageLabel = STAGE_LABELS[item.stage] ?? item.stage

          return (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Summary row */}
              <div className="w-full flex items-center gap-4 px-5 py-4">
                <button
                  type="button"
                  className="text-gray-400 flex-shrink-0"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                {/* Tank + beer — clickable to expand */}
                <button
                  type="button"
                  className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  onClick={() => setExpanded(isOpen ? null : item.id)}
                >
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

                  {/* Dates */}
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    <p className="text-xs text-gray-500">{format(parseISO(item.brew_day), 'd MMM yyyy')}</p>
                    <p className="text-xs text-gray-400">{days}d in tank</p>
                  </div>

                  {/* Volume */}
                  <div className="flex-shrink-0 text-right w-16 hidden md:block">
                    <p className="text-xs font-medium text-gray-700">{item.volume_l}L</p>
                  </div>

                  {/* Gravity */}
                  <div className="flex-shrink-0 text-right w-28 hidden md:block">
                    <p className="text-xs tabular-nums text-gray-500">
                      {item.og_plato != null ? `${item.og_plato}°P` : '—'}
                      {item.final_plato != null ? ` → ${item.final_plato}°P` : ''}
                    </p>
                    {item.abv != null && (
                      <p className="text-xs font-semibold text-indigo-600 tabular-nums">{item.abv.toFixed(1)}% ABV</p>
                    )}
                  </div>

                  {/* Stage badge */}
                  <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${stageColour}`}>
                    {stageLabel}
                  </span>

                  {/* Completion date */}
                  <div className="flex-shrink-0 text-right w-24 hidden lg:block">
                    <p className="text-xs text-gray-400">{format(parseISO(item.completed_at), 'd MMM yyyy')}</p>
                  </div>
                </button>

                {/* Edit / delete actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditItem(item)}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/40 space-y-4">
                  {/* Key stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Brew Day', value: format(parseISO(item.brew_day), 'd MMM yyyy') },
                      { label: 'Completed', value: format(parseISO(item.completed_at), 'd MMM yyyy') },
                      { label: 'Days in Tank', value: `${days}d` },
                      { label: 'Volume', value: `${item.volume_l}L` },
                      { label: 'OG', value: item.og_plato != null ? `${item.og_plato}°P` : '—' },
                      { label: 'FG', value: item.final_plato != null ? `${item.final_plato}°P` : '—' },
                      { label: 'ABV', value: item.abv != null ? `${item.abv.toFixed(1)}%` : '—', accent: true },
                      { label: 'Final pH', value: item.final_ph != null ? String(item.final_ph) : '—' },
                    ].map(({ label, value, accent }) => (
                      <div key={label} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
                        <p className={`text-sm font-semibold mt-0.5 tabular-nums ${accent ? 'text-indigo-600' : 'text-gray-800'}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {item.notes && (
                    <div className="text-xs text-gray-500 bg-white border border-gray-100 rounded-lg px-3 py-2">
                      <span className="font-medium text-gray-400 uppercase tracking-wide text-[10px] mr-2">Notes</span>
                      {item.notes}
                    </div>
                  )}

                  {/* Packaging runs */}
                  {item.packaging_runs.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Package className="h-3 w-3" /> Packaging
                      </p>
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
                            {item.packaging_runs.map((p) => {
                              const fmt = PACKAGE_FORMATS.find(f => f.format === p.format)
                              return (
                                <tr key={p.id} className="border-t border-gray-50">
                                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                    {format(parseISO(p.packaged_at), 'd MMM yyyy')}
                                  </td>
                                  <td className="px-3 py-1.5 text-gray-700">{fmt?.label ?? p.format}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{p.qty}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{p.volume_l.toFixed(1)}L</td>
                                  <td className="px-3 py-1.5 text-gray-400">{formatUserName(p.packaged_by)}</td>
                                  <td className="px-3 py-1.5 text-gray-400">{p.notes ?? ''}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t border-gray-100">
                            <tr>
                              <td colSpan={3} className="px-3 py-1.5 text-gray-400 font-medium">Total</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-700">
                                {item.packaging_runs.reduce((s, p) => s + p.volume_l, 0).toFixed(1)}L
                              </td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Readings table */}
                  {item.readings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Readings</p>
                      <div className="rounded-lg border border-gray-100 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-400">Date</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-400">Gravity</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-400">pH</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-400">By</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-400">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...item.readings].reverse().map((r) => {
                              const isStage = r.plato == null && r.ph == null && r.notes?.startsWith('→')
                              return (
                                <tr key={r.id} className={`border-t border-gray-50 ${isStage ? 'bg-gray-50/60' : ''}`}>
                                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                                    {format(parseISO(r.recorded_at), 'd MMM, HH:mm')}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                                    {r.plato != null ? `${r.plato}°P` : isStage ? '' : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                                    {r.ph != null ? r.ph : isStage ? '' : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
                                  <td className="px-3 py-1.5 text-gray-400">
                                    {isStage ? (
                                      <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-[10px] font-medium">
                                        {r.notes}
                                      </span>
                                    ) : (
                                      r.notes ?? ''
                                    )}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editItem && (
        <EditBrewModal item={editItem} onClose={() => setEditItem(null)} />
      )}
    </>
  )
}
