'use client'

import { useState, useTransition, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Search, Pencil, Trash2, Check, X } from 'lucide-react'
import { formatUserName } from '@/lib/utils'
import { updateReading, deleteReading } from './actions'

export interface ReadingRow {
  id: string
  recorded_at: string
  plato: number | null
  ph: number | null
  recorded_by: string
  notes: string | null
  tank_name: string
  beer_name: string
}

interface EditState {
  plato: string
  ph: string
  notes: string
}

interface Props {
  readings: ReadingRow[]
}

export function ReadingsList({ readings: initial }: Props) {
  const [readings, setReadings] = useState(initial)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [, startTransition] = useTransition()

  const gravityCount = readings.filter(r => r.plato != null || r.ph != null).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return readings
    return readings.filter(r =>
      r.beer_name.toLowerCase().includes(q) ||
      r.tank_name.toLowerCase().includes(q) ||
      r.recorded_by.toLowerCase().includes(q) ||
      (r.notes ?? '').toLowerCase().includes(q)
    )
  }, [readings, search])

  function startEdit(r: ReadingRow) {
    setEditingId(r.id)
    setEditState({
      plato: r.plato != null ? String(r.plato) : '',
      ph: r.ph != null ? String(r.ph) : '',
      notes: r.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  function saveEdit(id: string) {
    if (!editState) return
    const plato = editState.plato !== '' ? parseFloat(editState.plato) : null
    const ph = editState.ph !== '' ? parseFloat(editState.ph) : null
    setReadings(prev => prev.map(r =>
      r.id === id ? { ...r, plato, ph, notes: editState.notes.trim() || null } : r
    ))
    setEditingId(null)
    setEditState(null)
    startTransition(() => updateReading(id, { plato, ph, notes: editState.notes }))
  }

  function handleDelete(r: ReadingRow) {
    const label = r.beer_name !== '—' ? `${r.beer_name} @ ${format(parseISO(r.recorded_at), 'd MMM HH:mm')}` : r.notes
    if (!confirm(`Delete reading "${label}"? This cannot be undone.`)) return
    setReadings(prev => prev.filter(x => x.id !== r.id))
    startTransition(() => deleteReading(r.id))
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Readings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {gravityCount} gravity/pH reading{gravityCount !== 1 ? 's' : ''}
            {filtered.length !== readings.length && ` · ${filtered.length} shown`}
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search beer, tank, logged by…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
        </div>
      </div>

      {readings.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">No readings logged yet.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Tank</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Beer</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Gravity</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">pH</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">By</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Notes</th>
                  <th className="w-16 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-gray-400 text-sm">
                      No readings match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                ) : filtered.map(r => {
                  const isStage = r.plato == null && r.ph == null && r.notes?.startsWith('→')
                  const isEditing = editingId === r.id

                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-gray-50 align-middle ${
                        isEditing ? 'bg-primary/5' : isStage ? 'bg-gray-50/50' : 'hover:bg-gray-50/40'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap tabular-nums text-xs">
                        {format(parseISO(r.recorded_at), 'd MMM yyyy, HH:mm')}
                      </td>
                      <td className="px-4 py-2.5 font-black text-gray-700 text-xs uppercase tracking-wide">{r.tank_name}</td>
                      <td className="px-4 py-2.5 font-bold text-gray-800 max-w-[160px] truncate">{r.beer_name}</td>

                      {/* Gravity */}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.1"
                            value={editState!.plato}
                            onChange={e => setEditState(s => s ? { ...s, plato: e.target.value } : s)}
                            placeholder="—"
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/40 ml-auto block"
                          />
                        ) : (
                          <span className="text-gray-700">
                            {r.plato != null ? `${r.plato}°P` : isStage ? '' : '—'}
                          </span>
                        )}
                      </td>

                      {/* pH */}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="14"
                            value={editState!.ph}
                            onChange={e => setEditState(s => s ? { ...s, ph: e.target.value } : s)}
                            placeholder="—"
                            className="w-16 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/40 ml-auto block"
                          />
                        ) : (
                          <span className="text-gray-700">
                            {r.ph != null ? r.ph : isStage ? '' : '—'}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[100px] truncate">{formatUserName(r.recorded_by)}</td>

                      {/* Notes */}
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editState!.notes}
                            onChange={e => setEditState(s => s ? { ...s, notes: e.target.value } : s)}
                            placeholder="Notes…"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        ) : isStage ? (
                          <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-[10px] font-medium">
                            {r.notes}
                          </span>
                        ) : (
                          r.notes ?? ''
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-2.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(r.id)}
                              className="p-1 rounded text-[#09434d] hover:bg-[#09434d]/10"
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {!isStage && (
                              <button
                                type="button"
                                onClick={() => startEdit(r)}
                                className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(r)}
                              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
    </>
  )
}
