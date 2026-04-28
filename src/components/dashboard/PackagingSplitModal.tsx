'use client'

import { useState, useEffect, useTransition } from 'react'
import { X } from 'lucide-react'
import { savePackagingSplit, getPackagingSplit } from '@/app/brews/actions'
import { PACKAGE_FORMATS, HOP_LOAD_LOSS, HOP_LOAD_LABELS } from '@/types'
import type { Brew, HopLoad, PackagingSplit } from '@/types'

type Quantities = { '24x375': number; '16x440': number; keg30: number; keg50: number }

const EMPTY_QTY: Quantities = { '24x375': 0, '16x440': 0, keg30: 0, keg50: 0 }

function splitToQty(split: PackagingSplit): Quantities {
  return {
    '24x375': split.qty_24x375,
    '16x440': split.qty_16x440,
    keg30: split.qty_keg30,
    keg50: split.qty_keg50,
  }
}

export function PackagingSplitModal({ brew, onClose }: { brew: Brew; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [hopLoad, setHopLoad] = useState<HopLoad>('medium')
  const [qty, setQty] = useState<Quantities>(EMPTY_QTY)
  const [notes, setNotes] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    getPackagingSplit(brew.id).then(split => {
      if (split) {
        setHopLoad(split.hop_load)
        setQty(splitToQty(split))
        setNotes(split.notes ?? '')
      }
      setLoading(false)
    })
  }, [brew.id])

  const loss = HOP_LOAD_LOSS[hopLoad]
  const afterFermentVol = brew.volume_l * (1 - loss)

  const allocatedL =
    qty['24x375'] * 9.0 +
    qty['16x440'] * 7.04 +
    qty.keg30 * 30 +
    qty.keg50 * 50

  const remainingL = afterFermentVol - allocatedL
  const pct = Math.min(100, afterFermentVol > 0 ? (allocatedL / afterFermentVol) * 100 : 0)
  const isOver = remainingL < -0.01

  const qtyKey = (format: string) => format.replace('x', 'x') as keyof Quantities

  function adjust(format: string, delta: number) {
    const k = qtyKey(format)
    setQty(q => ({ ...q, [k]: Math.max(0, (q[k] ?? 0) + delta) }))
  }

  function set(format: string, val: number) {
    const k = qtyKey(format)
    setQty(q => ({ ...q, [k]: Math.max(0, val) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await savePackagingSplit({
        brew_id: brew.id,
        hop_load: hopLoad,
        qty_24x375: qty['24x375'],
        qty_16x440: qty['16x440'],
        qty_keg30: qty.keg30,
        qty_keg50: qty.keg50,
        notes,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Est. Packaging Split</h2>
            <p className="text-xs text-gray-400 mt-0.5">{brew.beer_name} · {brew.volume_l} L in tank</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-5">
              {/* Hop load */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Hop load · fermentation loss</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as HopLoad[]).map(l => (
                    <button key={l} type="button" onClick={() => setHopLoad(l)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                        hopLoad === l
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {HOP_LOAD_LABELS[l]}
                      <span className="block text-[11px] opacity-70 mt-0.5">{(HOP_LOAD_LOSS[l] * 100).toFixed(0)}% loss</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* After ferment vol */}
              <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">After ferment volume</span>
                <span className="text-xl font-black text-gray-900 tabular-nums">{afterFermentVol.toFixed(1)} L</span>
              </div>

              {/* Format rows */}
              <div className="space-y-2.5">
                {PACKAGE_FORMATS.map(({ format, label, volume_l }) => {
                  const k = qtyKey(format)
                  const count = qty[k] ?? 0
                  const vol = count * volume_l
                  return (
                    <div key={format} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium">{label}</p>
                        <p className="text-xs text-gray-400 tabular-nums">{vol > 0 ? `${vol.toFixed(1)} L` : '—'}</p>
                      </div>
                      <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
                        <button type="button" onClick={() => adjust(format, -1)}
                          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-lg leading-none font-medium">
                          −
                        </button>
                        <input
                          type="number" min={0} value={count}
                          onChange={e => set(format, parseInt(e.target.value) || 0)}
                          className="w-12 h-9 text-center text-sm font-semibold focus:outline-none border-x border-gray-200"
                        />
                        <button type="button" onClick={() => adjust(format, 1)}
                          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-lg leading-none font-medium">
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Progress */}
              <div className="space-y-1.5">
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${isOver ? 'bg-red-400' : pct >= 95 ? 'bg-emerald-400' : 'bg-primary/60'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isOver ? 'text-red-500 font-semibold' : 'text-gray-500'}>
                    {isOver
                      ? `${Math.abs(remainingL).toFixed(1)} L over`
                      : `${remainingL.toFixed(1)} L remaining`}
                  </span>
                  <span className="text-gray-400 tabular-nums">{allocatedL.toFixed(1)} / {afterFermentVol.toFixed(1)} L</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="Any packaging notes…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 pb-6">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-xl hover:opacity-90">
                Save split
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
