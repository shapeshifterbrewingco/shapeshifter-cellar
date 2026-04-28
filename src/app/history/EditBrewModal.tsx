'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Trash2, Check } from 'lucide-react'
import { updateBrewHistory, deletePackagingRun, updatePackagingRun } from './actions'
import { PACKAGE_FORMATS } from '@/types'
import type { BrewHistoryItem, PackagingRun } from '@/lib/history'

interface Props {
  item: BrewHistoryItem
  onClose: () => void
}

export function EditBrewModal({ item, onClose }: Props) {
  const [beerName, setBeerName] = useState(item.beer_name)
  const [batchCode, setBatchCode] = useState(item.batch_code ?? '')
  const [style, setStyle] = useState(item.style ?? '')
  const [brewDay, setBrewDay] = useState(item.brew_day)
  const [volumeL, setVolumeL] = useState(String(item.volume_l))
  const [ogPlato, setOgPlato] = useState(item.og_plato != null ? String(item.og_plato) : '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [isPending, startTransition] = useTransition()
  const [runEdits, setRunEdits] = useState<Record<string, string>>(
    Object.fromEntries(item.packaging_runs.map(p => [p.id, String(p.qty)]))
  )
  const [savingRunId, setSavingRunId] = useState<string | null>(null)
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await updateBrewHistory(item.id, {
        beer_name: beerName.trim(),
        batch_code: batchCode.trim() || null,
        style: style.trim() || null,
        brew_day: brewDay,
        volume_l: parseFloat(volumeL) || item.volume_l,
        og_plato: ogPlato !== '' ? parseFloat(ogPlato) : null,
        notes: notes.trim() || null,
      })
      onClose()
    })
  }

  function handleSaveRun(p: PackagingRun) {
    const qty = parseInt(runEdits[p.id])
    if (isNaN(qty) || qty <= 0) return
    const fmt = PACKAGE_FORMATS.find(f => f.format === p.format)
    const volume_l = fmt ? qty * fmt.volume_l : p.volume_l
    setSavingRunId(p.id)
    startTransition(async () => {
      await updatePackagingRun(p.id, qty, volume_l)
      setSavingRunId(null)
    })
  }

  function handleDeleteRun(runId: string) {
    if (!confirm('Delete this packaging run?')) return
    setDeletingRunId(runId)
    startTransition(async () => {
      await deletePackagingRun(runId)
      setDeletingRunId(null)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">Edit Brew</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Beer name</label>
              <input
                type="text"
                value={beerName}
                onChange={e => setBeerName(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Batch code</label>
              <input
                type="text"
                value={batchCode}
                onChange={e => setBatchCode(e.target.value)}
                placeholder="e.g. 2026-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Style</label>
              <input
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Brew day</label>
              <input
                type="date"
                value={brewDay}
                onChange={e => setBrewDay(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Volume (L)</label>
              <input
                type="number"
                value={volumeL}
                onChange={e => setVolumeL(e.target.value)}
                step="1"
                min="1"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">OG (°Plato)</label>
              <input
                type="number"
                value={ogPlato}
                onChange={e => setOgPlato(e.target.value)}
                step="0.1"
                placeholder="—"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>

          {/* Packaging runs */}
          {item.packaging_runs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Packaging runs</p>
              <div className="space-y-1">
                {item.packaging_runs.map(p => {
                  const fmt = PACKAGE_FORMATS.find(f => f.format === p.format)
                  const qty = parseInt(runEdits[p.id])
                  const previewVol = fmt && !isNaN(qty) && qty > 0 ? qty * fmt.volume_l : p.volume_l
                  const changed = runEdits[p.id] !== String(p.qty)
                  return (
                    <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700">
                      <span className="flex-1 text-gray-600">{fmt?.label ?? p.format}</span>
                      <span className="text-gray-400">×</span>
                      <input
                        type="number"
                        value={runEdits[p.id]}
                        onChange={e => setRunEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                        min="1"
                        step="1"
                        className="w-16 border border-gray-200 rounded px-2 py-1 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      />
                      <span className="text-gray-400 w-14 tabular-nums">{previewVol.toFixed(1)}L</span>
                      <button
                        type="button"
                        onClick={() => handleSaveRun(p)}
                        disabled={!changed || savingRunId === p.id}
                        className="p-1 text-[#09434d] hover:text-[#09434d]/70 disabled:opacity-30 disabled:cursor-default"
                        title="Save"
                      >
                        {savingRunId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRun(p.id)}
                        disabled={deletingRunId === p.id}
                        className="p-1 text-red-400 hover:text-red-600 disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
