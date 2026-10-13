'use client'

import { useState } from 'react'

/** A bucket of bottoms, in litres. Two buckets off is 40 L. */
const BUCKET_L = 20

const litres = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('en-AU')} L`

/** Change what a tank holds: type the new figure, or knock buckets off. */
export function VolumeDialog({ name, current, onSave, onClose }: {
  name: string
  current: number
  onSave: (volume: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(String(current))
  const v = parseFloat(value)
  const ok = Number.isFinite(v) && v > 0 && v < 20000
  const change = ok ? Math.round((v - current) * 10) / 10 : 0
  const takeOff = (l: number) => setValue(String(Math.max(0, Math.round(((ok ? v : current) - l) * 10) / 10)))

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Change volume" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Volume in tank</h2>
          <p className="text-sm text-gray-500">{name} · was {litres(current)}</p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1.5">Bottoms off (1 bucket = {BUCKET_L} L)</p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" onClick={() => takeOff(n * BUCKET_L)}
                className="h-12 rounded-xl bg-black/[0.04] text-sm font-semibold text-gray-900 active:bg-black/10">
                −{n} bucket{n === 1 ? '' : 's'}
                <span className="block text-[11px] font-normal text-gray-500">{n * BUCKET_L} L</span>
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1.5">Or type what is in the tank now</span>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" autoComplete="off" value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
              className="w-full h-12 rounded-xl border border-gray-200 px-3 text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-base text-gray-500 font-medium flex-shrink-0">L</span>
          </div>
          <span className="block mt-1 h-4 text-xs tabular-nums text-malt-dark">
            {ok && change !== 0 ? `${litres(Math.abs(change))} ${change < 0 ? 'less' : 'more'} than before` : ''}
          </span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl active:bg-gray-50">Cancel</button>
          <button type="button" disabled={!ok || change === 0} onClick={() => { onSave(v); onClose() }}
            className="flex-1 h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-xl disabled:opacity-40 active:opacity-90">Save</button>
        </div>
      </div>
    </div>
  )
}
