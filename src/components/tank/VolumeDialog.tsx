'use client'

import { useState } from 'react'

/** A bucket of bottoms, in litres. Two buckets off is 40 L. */
const BUCKET_L = 20

const round1 = (n: number) => Math.round(n * 10) / 10
const litres = (n: number) => `${round1(n).toLocaleString('en-AU')} L`
const digits = (s: string) => s.replace(/[^0-9.]/g, '')

/**
 * Change what a tank holds. The usual case is bottoms coming off: type what
 * was taken and the new volume is worked out. Typing the volume itself is
 * still there for a correction.
 */
export function VolumeDialog({ name, current, simple = false, onSave, onClose }: {
  name: string
  /** Just a box for the new volume: no deduction, buckets or note */
  simple?: boolean
  current: number
  onSave: (volume: number, note: string) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'taken' | 'direct'>(simple ? 'direct' : 'taken')
  const [taken, setTaken] = useState('')
  const [direct, setDirect] = useState(String(current))
  const [note, setNote] = useState('')

  const t = parseFloat(taken)
  const d = parseFloat(direct)
  const next = mode === 'taken' ? (Number.isFinite(t) ? round1(current - t) : current) : (Number.isFinite(d) ? d : NaN)
  const ok = Number.isFinite(next) && next > 0 && next < 20000 && next !== current
  const tooMuch = mode === 'taken' && Number.isFinite(t) && t >= current
  const addBuckets = (n: number) => setTaken(String(round1((Number.isFinite(t) ? t : 0) + n * BUCKET_L)))

  const INPUT = 'w-full h-12 rounded-xl border border-gray-200 px-3 text-xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Change volume" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{simple ? 'Edit volume' : 'Volume in tank'}</h2>
          <p className="text-sm text-gray-500">{name} · {litres(current)} now</p>
        </div>

        {mode === 'taken' ? (
          <>
            <label className="block">
              <span className="block text-xs text-gray-500 mb-1.5">Litres taken off</span>
              <div className="flex items-center gap-2">
                <input type="text" inputMode="decimal" autoComplete="off" autoFocus value={taken} placeholder="0"
                  onChange={(e) => setTaken(digits(e.target.value))} className={INPUT} />
                <span className="text-base text-gray-500 font-medium flex-shrink-0">L</span>
              </div>
            </label>
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Or add buckets (1 bucket = {BUCKET_L} L)</p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((n) => (
                  <button key={n} type="button" onClick={() => addBuckets(n)}
                    className="h-11 rounded-xl bg-black/[0.04] text-sm font-semibold text-gray-900 active:bg-black/10">
                    +{n} bucket{n === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1.5">{simple ? 'New volume' : 'What is in the tank'}</span>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" autoComplete="off" autoFocus value={direct} onFocus={(e) => e.target.select()}
                onChange={(e) => setDirect(digits(e.target.value))} className={INPUT} />
              <span className="text-base text-gray-500 font-medium flex-shrink-0">L</span>
            </div>
          </label>
        )}

        {!simple && <>
        <div className="rounded-xl bg-water/25 px-3 py-2.5">
          <p className="text-xs text-gray-600">New volume</p>
          <p className="text-2xl font-bold tabular-nums text-gray-900">{tooMuch || !Number.isFinite(next) ? '-' : litres(next)}</p>
          {tooMuch && <p className="text-xs text-malt-dark">That is more than the tank holds.</p>}
        </div>

        <div>
          <label className="block">
            <span className="block text-xs text-gray-500 mb-1.5">Note (optional)</span>
            <input type="text" autoComplete="off" maxLength={120} value={note} placeholder="e.g. Cold break" onChange={(e) => setNote(e.target.value)}
              className="w-full h-11 rounded-xl border border-gray-200 px-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {['Cold break', 'Dropped bottoms', 'Yeast harvest', 'Sample'].map((q) => (
              <button key={q} type="button" onClick={() => setNote(q)} aria-pressed={note === q}
                className={`h-8 px-2.5 rounded-full text-xs font-medium ${note === q ? 'bg-primary text-white' : 'bg-black/[0.04] text-gray-600'}`}>{q}</button>
            ))}
          </div>
        </div>

        <button type="button" onClick={() => setMode(mode === 'taken' ? 'direct' : 'taken')} className="text-sm font-medium text-primary">
          {mode === 'taken' ? 'Type the volume instead' : 'Type what was taken off instead'}
        </button>
        </>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-11 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl active:bg-gray-50">Cancel</button>
          <button type="button" disabled={!ok} onClick={() => { onSave(next, note); onClose() }}
            className="flex-1 h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-xl disabled:opacity-40 active:opacity-90">Save</button>
        </div>
      </div>
    </div>
  )
}
