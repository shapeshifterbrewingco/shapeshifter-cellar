'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { logVdkReading, getBrewVdkReadings } from '@/app/brews/actions'
import { format, parseISO } from 'date-fns'
import { formatUserName } from '@/lib/utils'
import type { Brew, Tank, VdkResult } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  currentUser: string
  onClose: () => void
  onVdkPass: () => void
}

type Reading = { id: string; result: VdkResult; recorded_at: string; recorded_by: string; notes: string | null }

const RESULTS: { result: VdkResult; label: string; bg: string; text: string; border: string }[] = [
  { result: 'high',   label: 'High',   bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    },
  { result: 'medium', label: 'Medium', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { result: 'low',    label: 'Low',    bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  { result: 'pass',   label: 'Pass',   bg: 'bg-[#09434d]/10',  text: 'text-[#09434d]',  border: 'border-[#09434d]/20'  },
]

function resultConfig(r: VdkResult) {
  return RESULTS.find(c => c.result === r) ?? RESULTS[0]
}

export function VdkModal({ brew, tank, currentUser, onClose, onVdkPass }: Props) {
  const [notes, setNotes] = useState('')
  const [readings, setReadings] = useState<Reading[]>([])
  const [loadingReadings, setLoadingReadings] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getBrewVdkReadings(brew.id)
      .then(data => setReadings(data as Reading[]))
      .finally(() => setLoadingReadings(false))
  }, [brew.id])

  function handleLog(result: VdkResult) {
    startTransition(async () => {
      await logVdkReading({
        brew_id: brew.id,
        tank_id: tank.id,
        result,
        recorded_by: currentUser,
        notes,
      })
      if (result === 'pass') {
        onVdkPass()
        return
      }
      const updated = await getBrewVdkReadings(brew.id)
      setReadings(updated as Reading[])
      setNotes('')
    })
  }

  const latest = readings[0]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">VDK Test</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {brew.beer_name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}
              {latest && (
                <> · last: <span className={`font-medium ${resultConfig(latest.result).text}`}>{resultConfig(latest.result).label}</span></>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Result buttons */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Log today's result</p>
            <div className="grid grid-cols-4 gap-2">
              {RESULTS.map(({ result, label, bg, text, border }) => (
                <button
                  key={result}
                  type="button"
                  onClick={() => handleLog(result)}
                  disabled={isPending}
                  className={`py-3 text-sm font-semibold rounded-xl border-2 transition-colors disabled:opacity-50 ${bg} ${text} ${border} hover:brightness-95`}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : label}
                </button>
              ))}
            </div>
            {latest?.result === 'pass' && (
              <p className="text-xs text-[#09434d] font-medium mt-2 text-center">
                ✓ VDK passed — you can now advance to On Chill
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Slight butterscotch on aroma"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* History */}
          {!loadingReadings && readings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Recent readings</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {readings.map(r => {
                  const cfg = resultConfig(r.result)
                  return (
                    <div key={r.id} className="flex items-center gap-3 text-xs py-1.5 px-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-400 w-16 flex-shrink-0">
                        {format(parseISO(r.recorded_at), 'd MMM')}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                      <span className="text-gray-400 truncate">{r.notes ?? ''}</span>
                      <span className="text-gray-300 ml-auto flex-shrink-0">{formatUserName(r.recorded_by)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!loadingReadings && readings.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No VDK tests logged yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
