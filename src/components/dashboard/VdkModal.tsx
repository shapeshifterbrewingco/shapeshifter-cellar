'use client'

import { logDay } from '@/lib/log-date'
import { useState, useEffect, useTransition } from 'react'
import { toast } from 'sonner'
import { X, Loader2, Pencil, Trash2 } from 'lucide-react'
import { logVdkReading, getBrewVdkReadings, updateVdkReading, deleteVdkReading } from '@/app/brews/actions'
import { format, parseISO } from 'date-fns'
import { formatUserName } from '@/lib/utils'
import { VDK_STYLE } from '@/lib/vdk'
import type { Brew, Tank, VdkResult } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  currentUser: string
  onClose: () => void
  onVdkPass: () => void
}

type Reading = { id: string; result: VdkResult; recorded_at: string; recorded_by: string; notes: string | null }

const ORDER: VdkResult[] = ['high', 'medium', 'low', 'pass']

export function VdkModal({ brew, tank, currentUser, onClose, onVdkPass }: Props) {
  // Nothing is saved until Save is pressed: picking a result only selects it
  const [picked, setPicked] = useState<VdkResult | null>(null)
  const [notes, setNotes] = useState('')
  const [readings, setReadings] = useState<Reading[]>([])
  const [loadingReadings, setLoadingReadings] = useState(true)
  // The entry being corrected, if any
  const [editing, setEditing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const reload = () => getBrewVdkReadings(brew.id).then((data) => setReadings(data as Reading[]))

  useEffect(() => {
    getBrewVdkReadings(brew.id)
      .then((data) => setReadings(data as Reading[]))
      .finally(() => setLoadingReadings(false))
  }, [brew.id])

  function save() {
    if (!picked || isPending) return
    const result = picked
    startTransition(async () => {
      try {
        await logVdkReading({ brew_id: brew.id, tank_id: tank.id, result, recorded_by: currentUser, notes })
      } catch {
        toast.error('VDK result did not save. Try again.')
        return
      }
      toast.success(`VDK ${VDK_STYLE[result].label.toLowerCase()} logged for ${tank.name}`)
      if (result === 'pass') { onVdkPass(); return }
      await reload()
      setPicked(null)
      setNotes('')
    })
  }

  function change(id: string, result: VdkResult) {
    startTransition(async () => {
      const res = await updateVdkReading(id, result).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
      if (!res.ok) { toast.error(res.message); return }
      setEditing(null)
      await reload()
    })
  }

  function remove(r: Reading) {
    if (!confirm(`Delete the ${VDK_STYLE[r.result].label} result from ${format(parseISO(r.recorded_at), 'd MMM')}?`)) return
    startTransition(async () => {
      const res = await deleteVdkReading(r.id).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
      if (!res.ok) { toast.error(res.message); return }
      setEditing(null)
      await reload()
    })
  }

  const latest = readings[0]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">VDK test</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tank.name} · {brew.beer_name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}
              {latest && <> · last: <span className={`font-medium ${VDK_STYLE[latest.result].text}`}>{VDK_STYLE[latest.result].label}</span></>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Today&apos;s result</p>
            <div className="grid grid-cols-4 gap-2">
              {ORDER.map((result) => {
                const s = VDK_STYLE[result]
                const on = picked === result
                return (
                  <button
                    key={result}
                    type="button"
                    onClick={() => setPicked(on ? null : result)}
                    aria-pressed={on}
                    disabled={isPending}
                    className={`h-12 text-sm font-semibold rounded-xl border-2 transition-colors disabled:opacity-50 ${s.bg} ${s.text} ${on ? 'border-primary ring-2 ring-primary/30' : s.border}`}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5" htmlFor="vdk-notes">Notes (optional)</label>
            <input
              id="vdk-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Slight butterscotch on aroma"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <button type="button" onClick={save} disabled={!picked || isPending}
            className="w-full h-12 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {picked ? `Save: VDK ${VDK_STYLE[picked].label.toLowerCase()}` : 'Pick a result to save'}
          </button>
          {picked === 'pass' && <p className="text-xs text-gray-500 text-center -mt-2">A pass lets this tank move on to On Chill.</p>}

          {!loadingReadings && readings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Logged so far</p>
              <ul className="space-y-1.5">
                {readings.map((r) => {
                  const s = VDK_STYLE[r.result]
                  const isEditing = editing === r.id
                  return (
                    <li key={r.id} className="rounded-xl bg-gray-50 px-3 py-2">
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-gray-400 w-12 flex-shrink-0 tabular-nums">{logDay(r.recorded_at)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>
                        <span className="text-gray-500 truncate flex-1 min-w-0">{r.notes ?? ''}</span>
                        <span className="text-gray-400 flex-shrink-0">{formatUserName(r.recorded_by)}</span>
                        <button type="button" onClick={() => setEditing(isEditing ? null : r.id)} aria-label="Correct this result" aria-expanded={isEditing}
                          className="h-8 w-8 -mr-1 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {isEditing && (
                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-1.5">
                          <span className="text-[11px] text-gray-500 mr-auto">Change to</span>
                          {ORDER.filter((x) => x !== r.result).map((x) => (
                            <button key={x} type="button" disabled={isPending} onClick={() => change(r.id, x)}
                              className={`h-8 px-2.5 rounded-lg border text-xs font-semibold disabled:opacity-50 ${VDK_STYLE[x].bg} ${VDK_STYLE[x].text} ${VDK_STYLE[x].border}`}>
                              {VDK_STYLE[x].label}
                            </button>
                          ))}
                          <button type="button" disabled={isPending} onClick={() => remove(r)} aria-label="Delete this result"
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!loadingReadings && readings.length === 0 && <p className="text-xs text-gray-400 text-center py-1">No VDK tests logged yet.</p>}
        </div>
      </div>
    </div>
  )
}
