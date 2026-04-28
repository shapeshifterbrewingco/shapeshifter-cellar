'use client'

import { useState, useTransition } from 'react'
import { X, ArrowRight, Loader2 } from 'lucide-react'
import { transferBrew } from '@/app/brews/actions'
import type { Brew, Tank, TankDashboardData } from '@/types'

interface Props {
  brew: Brew
  sourceTank: Tank
  allTanks: TankDashboardData[]
  onClose: () => void
}

export function TransferModal({ brew, sourceTank, allTanks, onClose }: Props) {
  const available = allTanks.filter(
    t => t.tank.id !== sourceTank.id && (!t.brew || t.brew.stage === 'empty')
  )

  const [destTankId, setDestTankId] = useState(available[0]?.tank.id ?? '')
  const [volumeOut, setVolumeOut] = useState(String(brew.volume_l))
  const [batchCode, setBatchCode] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const vol = parseFloat(volumeOut)
    if (!destTankId || isNaN(vol) || vol <= 0) return
    startTransition(async () => {
      await transferBrew({
        brew_id: brew.id,
        source_tank_id: sourceTank.id,
        dest_tank_id: destTankId,
        volume_in_l: brew.volume_l,
        volume_out_l: vol,
        batch_code: batchCode.trim() || null,
        notes,
      })
      onClose()
    })
  }

  const loss = brew.volume_l - (parseFloat(volumeOut) || 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Transfer</h2>
            <p className="text-xs text-gray-400 mt-0.5">{brew.beer_name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Source → Dest */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-2 rounded-lg flex-shrink-0">
              {sourceTank.name}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
            {available.length === 0 ? (
              <span className="text-sm text-red-500">No empty tanks available</span>
            ) : (
              <select
                value={destTankId}
                onChange={e => setDestTankId(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              >
                {available.map(t => (
                  <option key={t.tank.id} value={t.tank.id}>{t.tank.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Volume */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Volume into destination (L)
              <span className="text-gray-400 font-normal ml-1">— was {brew.volume_l}L</span>
            </label>
            <input
              type="number"
              value={volumeOut}
              onChange={e => setVolumeOut(e.target.value)}
              step="1"
              min="1"
              max={brew.volume_l}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {loss > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                Transfer loss: {loss.toFixed(0)}L ({((loss / brew.volume_l) * 100).toFixed(1)}%)
              </p>
            )}
          </div>

          {/* Batch code */}
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

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Pulled trub, nice clarity"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

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
              disabled={isPending || available.length === 0}
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {isPending ? 'Transferring…' : 'Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
