'use client'

import { useState, useEffect, useTransition } from 'react'
import { X } from 'lucide-react'
import { savePackagingSplit, getPackagingSplit, getScheduledSplit } from '@/app/brews/actions'
import { PACKAGE_FORMATS, HOP_LOAD_LOSS, HOP_LOAD_LABELS, EXCISE_CATEGORY_LABELS, DEFAULT_SETTINGS } from '@/types'
import type { HopLoad, PackagingSplit, ExciseCategory, AppSettings } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
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

// ── Formatting helpers ─────────────────────────────────────────────────────────
function fmt$(n: number) {
  return n.toLocaleString('en-AU', {
    style: 'currency', currency: 'AUD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}
function fmtLaL(n: number) { return n.toFixed(3) }

// ── Interfaces ─────────────────────────────────────────────────────────────────
interface Props {
  brewId?: string | null
  scheduledBrewId?: string | null
  title: string
  subtitle?: string
  volume_l?: number | null
  defaultHopLoad?: HopLoad
  settings: AppSettings
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────────────────────────
export function PackagingSplitModal({
  brewId, scheduledBrewId, title, subtitle, volume_l, defaultHopLoad = 'medium', settings, onClose,
}: Props) {
  const [loading, setLoading] = useState(true)

  // Volume allocation
  const [hopLoad, setHopLoad] = useState<HopLoad>(defaultHopLoad)
  const [qty, setQty] = useState<Quantities>(EMPTY_QTY)

  // Excise & canning
  const [abv, setAbv] = useState('')
  const [exciseCat, setExciseCat] = useState<ExciseCategory>('standard')
  const [clipColour, setClipColour] = useState('')
  const [collarsOnSite, setCollarsOnSite] = useState('0')
  const [decalsOnSite, setDecalsOnSite] = useState('0')

  const [notes, setNotes] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    const fetch = brewId
      ? getPackagingSplit(brewId)
      : scheduledBrewId ? getScheduledSplit(scheduledBrewId) : Promise.resolve(null)

    fetch.then(split => {
      if (split) {
        setHopLoad(split.hop_load)
        setQty(splitToQty(split))
        setNotes(split.notes ?? '')
        if (split.abv != null) setAbv(String(split.abv))
        if (split.excise_category) setExciseCat(split.excise_category)
        if (split.clip_colour) setClipColour(split.clip_colour)
        setCollarsOnSite(String(split.collars_on_site ?? 0))
        setDecalsOnSite(String(split.decals_on_site ?? 0))
      }
      setLoading(false)
    })
  }, [brewId, scheduledBrewId])

  // ── Safe rate access (guards against pre-migration undefined values) ──────────
  const rates = {
    canStd:  settings.excise_rate_can_std  ?? DEFAULT_SETTINGS.excise_rate_can_std,
    kegStd:  settings.excise_rate_keg_std  ?? DEFAULT_SETTINGS.excise_rate_keg_std,
    rtd:     settings.excise_rate_rtd      ?? DEFAULT_SETTINGS.excise_rate_rtd,
    kegMid:  settings.excise_rate_keg_mid  ?? DEFAULT_SETTINGS.excise_rate_keg_mid,
    perL:    settings.sa_canning_rate_per_l   ?? DEFAULT_SETTINGS.sa_canning_rate_per_l,
    perEnd:  settings.sa_canning_rate_per_end ?? DEFAULT_SETTINGS.sa_canning_rate_per_end,
  }

  // ── Volume allocation calculations ────────────────────────────────────────────
  const loss          = HOP_LOAD_LOSS[hopLoad]
  const hasVolume     = volume_l != null && volume_l > 0
  const afterFerment  = hasVolume ? volume_l! * (1 - loss) : null
  const canVol        = qty['24x375'] * 9.0  + qty['16x440'] * 7.04
  const kegVol        = qty.keg30 * 30 + qty.keg50 * 50
  const allocatedL    = canVol + kegVol
  const remainingL    = afterFerment != null ? afterFerment - allocatedL : null
  const pct           = afterFerment ? Math.min(100, (allocatedL / afterFerment) * 100) : 0
  const isOver        = remainingL != null && remainingL < -0.01

  // ── Excise calculations ───────────────────────────────────────────────────────
  const abvNum    = parseFloat(abv)
  const hasAbv    = !isNaN(abvNum) && abvNum > 0
  const canLaL    = hasAbv && canVol > 0 ? canVol  * abvNum / 100 : null
  const kegLaL    = hasAbv && kegVol > 0 ? kegVol  * abvNum / 100 : null
  const canRate   = exciseCat === 'rtd' ? rates.rtd : rates.canStd
  const kegRate   = exciseCat === 'mid_strength' ? rates.kegMid : rates.kegStd
  const canExcise = canLaL != null ? canLaL * canRate : null
  const kegExcise = kegLaL != null ? kegLaL * kegRate : null
  const totalExcise = (canExcise ?? 0) + (kegExcise ?? 0)

  // ── SA Canning calculations ───────────────────────────────────────────────────
  // cost per can = fill cost + end cost = (volume_mL/1000 * $/L) + $/end
  const costPer375 = (0.375 * rates.perL) + rates.perEnd  // per 375mL can
  const costPer440 = (0.440 * rates.perL) + rates.perEnd  // per 440mL can
  const canningCost375 = qty['24x375'] > 0 ? qty['24x375'] * 24 * costPer375 : null
  const canningCost440 = qty['16x440'] > 0 ? qty['16x440'] * 16 * costPer440 : null
  const totalCanning   = (canningCost375 ?? 0) + (canningCost440 ?? 0)

  // ── Materials ─────────────────────────────────────────────────────────────────
  const totalCanCases  = qty['24x375'] + qty['16x440']
  const totalKegs      = qty.keg30 + qty.keg50
  const collarsNeeded  = totalKegs
  const decalsNeeded   = totalKegs
  const canLabels      = qty['24x375'] * 24 + qty['16x440'] * 16
  const collarsOnSiteN = parseInt(collarsOnSite) || 0
  const decalsOnSiteN  = parseInt(decalsOnSite)  || 0

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function adjust(format: string, delta: number) {
    const k = format as keyof Quantities
    setQty(q => ({ ...q, [k]: Math.max(0, (q[k] ?? 0) + delta) }))
  }
  function setFormat(format: string, val: number) {
    const k = format as keyof Quantities
    setQty(q => ({ ...q, [k]: Math.max(0, val) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      await savePackagingSplit({
        brew_id: brewId ?? null,
        scheduled_brew_id: scheduledBrewId ?? null,
        hop_load: hopLoad,
        qty_24x375: qty['24x375'],
        qty_16x440: qty['16x440'],
        qty_keg30:  qty.keg30,
        qty_keg50:  qty.keg50,
        notes,
        abv: hasAbv ? abvNum : null,
        excise_category: exciseCat,
        clip_colour: clipColour || null,
        collars_on_site: collarsOnSiteN,
        decals_on_site:  decalsOnSiteN,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Packaging Plan</h2>
            <p className="text-xs text-gray-400 mt-0.5">{title}{subtitle ? ` · ${subtitle}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

              {/* ── ABV (always visible, prominent) ──────────────────────── */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-1.5">ABV %</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number" step="0.1" min="0" max="100" value={abv}
                      onChange={e => setAbv(e.target.value)}
                      placeholder="e.g. 5.2"
                      className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-base font-semibold text-gray-500">%</span>
                    {hasAbv && (
                      <span className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200 font-medium">
                        Used in excise calculation below
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Hop load ─────────────────────────────────────────────── */}
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

              {/* After ferment volume */}
              {afterFerment != null && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">After ferment volume</span>
                  <span className="text-xl font-black text-gray-900 tabular-nums">{afterFerment.toFixed(1)} L</span>
                </div>
              )}

              {/* ── Package format rows ───────────────────────────────────── */}
              <div className="space-y-2.5">
                {PACKAGE_FORMATS.map(({ format, label, volume_l: fvol }) => {
                  const k = format as keyof Quantities
                  const count = qty[k] ?? 0
                  const vol = count * fvol
                  return (
                    <div key={format} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 font-medium">{label}</p>
                        <p className="text-xs text-gray-400 tabular-nums">{vol > 0 ? `${vol.toFixed(1)} L` : '—'}</p>
                      </div>
                      <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden">
                        <button type="button" onClick={() => adjust(format, -1)}
                          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-lg leading-none font-medium">−</button>
                        <input
                          type="number" min={0} value={count}
                          onChange={e => setFormat(format, parseInt(e.target.value) || 0)}
                          className="w-12 h-9 text-center text-sm font-semibold focus:outline-none border-x border-gray-200"
                        />
                        <button type="button" onClick={() => adjust(format, 1)}
                          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 text-lg leading-none font-medium">+</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Progress bar */}
              {afterFerment != null && remainingL != null && (
                <div className="space-y-1.5">
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${isOver ? 'bg-red-400' : pct >= 95 ? 'bg-emerald-400' : 'bg-primary/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className={isOver ? 'text-red-500 font-semibold' : 'text-gray-500'}>
                      {isOver ? `${Math.abs(remainingL).toFixed(1)} L over` : `${remainingL.toFixed(1)} L remaining`}
                    </span>
                    <span className="text-gray-400 tabular-nums">{allocatedL.toFixed(1)} / {afterFerment.toFixed(1)} L</span>
                  </div>
                </div>
              )}

              {/* ── Excise & Canning ─────────────────────────────────────── */}
              {allocatedL > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Excise & Canning</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  {/* Product type */}
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1.5">Product type</label>
                    <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                      {(Object.entries(EXCISE_CATEGORY_LABELS) as [ExciseCategory, string][]).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => setExciseCat(k)}
                          className={`flex-1 py-2 text-xs font-semibold transition-colors border-r border-gray-200 last:border-0 ${
                            exciseCat === k ? 'bg-primary text-primary-foreground' : 'text-gray-600 hover:bg-gray-50'
                          }`}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Excise return block */}
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        Excise Return — Schedule 1
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-2.5 font-mono text-sm">
                      {/* Can stream */}
                      {canVol > 0 && (
                        <ExciseLine
                          code="Item 1.1"
                          label={`Beer – can/btl  (${canVol.toFixed(1)} L × ${hasAbv ? abv : '?'}%)`}
                          lal={canLaL}
                          rate={canRate}
                          excise={canExcise}
                          hasAbv={hasAbv}
                        />
                      )}
                      {/* Keg stream */}
                      {kegVol > 0 && (
                        <ExciseLine
                          code="Item 1.3"
                          label={`Beer – keg       (${kegVol.toFixed(1)} L × ${hasAbv ? abv : '?'}%)`}
                          lal={kegLaL}
                          rate={kegRate}
                          excise={kegExcise}
                          hasAbv={hasAbv}
                        />
                      )}
                      {/* Total */}
                      {(canVol > 0 || kegVol > 0) && hasAbv && (
                        <>
                          <div className="border-t border-gray-300 pt-2 flex justify-between items-baseline">
                            <span className="font-bold text-gray-800 text-xs">TOTAL EXCISE</span>
                            <span className="font-black text-gray-900 tabular-nums">{fmt$(totalExcise)}</span>
                          </div>
                        </>
                      )}
                      {!hasAbv && (
                        <p className="text-xs text-gray-400 italic">Enter ABV above to calculate excise amounts</p>
                      )}
                    </div>
                  </div>

                  {/* SA Canning */}
                  {(canningCost375 != null || canningCost440 != null) && (
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                      <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">SA Canning Cost</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {fmt$(rates.perL)}/L fill + {fmt$(rates.perEnd)}/end
                        </p>
                      </div>
                      <div className="px-4 py-3 space-y-1.5 text-sm">
                        {canningCost375 != null && (
                          <div className="flex justify-between text-gray-700">
                            <span>375mL — {qty['24x375']} × 24 = {(qty['24x375'] * 24).toLocaleString()} cans</span>
                            <span className="font-semibold tabular-nums">{fmt$(canningCost375)}</span>
                          </div>
                        )}
                        {canningCost440 != null && (
                          <div className="flex justify-between text-gray-700">
                            <span>440mL — {qty['16x440']} × 16 = {(qty['16x440'] * 16).toLocaleString()} cans</span>
                            <span className="font-semibold tabular-nums">{fmt$(canningCost440)}</span>
                          </div>
                        )}
                        {(canningCost375 != null && canningCost440 != null) && (
                          <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                            <span>Total</span>
                            <span className="tabular-nums">{fmt$(totalCanning)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Clip colour */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1.5">Clip colour</label>
                      <input
                        type="text" value={clipColour} onChange={e => setClipColour(e.target.value)}
                        placeholder="e.g. Red, Gold…"
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    {/* Collars/decals — only when kegs */}
                    {totalKegs > 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1.5">
                          Kegs: {collarsNeeded} collar{collarsNeeded !== 1 ? 's' : ''} needed
                        </label>
                        <InventoryField
                          label="Collars on site"
                          value={collarsOnSite}
                          onChange={setCollarsOnSite}
                          needed={collarsNeeded}
                        />
                      </div>
                    )}
                  </div>

                  {totalKegs > 0 && (
                    <InventoryRow
                      label={`Decals needed: ${decalsNeeded}`}
                      hint="On site"
                      value={decalsOnSite}
                      onChange={setDecalsOnSite}
                      needed={decalsNeeded}
                      onSiteNum={decalsOnSiteN}
                    />
                  )}

                  {/* Materials summary */}
                  {(totalCanCases > 0 || totalKegs > 0) && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {totalCanCases > 0 && (
                        <>
                          <MatChip label="Clips" value={String(totalCanCases)} />
                          <MatChip label="Can labels" value={canLabels.toLocaleString()} />
                          <MatChip label="Carton labels" value={String(totalCanCases)} />
                        </>
                      )}
                      {totalKegs > 0 && (
                        <>
                          <MatChip
                            label="Collars"
                            value={`${collarsNeeded} needed`}
                            sub={collarsOnSiteN > 0 ? `${collarsOnSiteN} on site` : undefined}
                            ok={collarsOnSiteN >= collarsNeeded && collarsOnSiteN > 0}
                          />
                          <MatChip
                            label="Decals"
                            value={`${decalsNeeded} needed`}
                            sub={decalsOnSiteN > 0 ? `${decalsOnSiteN} on site` : undefined}
                            ok={decalsOnSiteN >= decalsNeeded && decalsOnSiteN > 0}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

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
            <div className="flex gap-2 px-6 pb-6 pt-4 border-t border-gray-100 flex-shrink-0">
              <button type="button" onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit"
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-xl hover:opacity-90">
                Save plan
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ExciseLine({
  code, label, lal, rate, excise, hasAbv,
}: {
  code: string
  label: string
  lal: number | null
  rate: number
  excise: number | null
  hasAbv: boolean
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold text-gray-800 text-xs">{code}</span>
        <span className="text-gray-500 text-xs flex-1 truncate ml-2">{label}</span>
        {hasAbv && lal != null ? (
          <span className="text-primary font-bold tabular-nums">{fmtLaL(lal)} LaL</span>
        ) : (
          <span className="text-gray-300 tabular-nums">— LaL</span>
        )}
      </div>
      <div className="flex justify-between text-xs pl-0">
        <span className="text-gray-400">@ {fmt$(rate)}/LaL</span>
        {hasAbv && excise != null ? (
          <span className="text-gray-700 font-semibold tabular-nums">= {fmt$(excise)}</span>
        ) : (
          <span className="text-gray-300">= —</span>
        )}
      </div>
    </div>
  )
}

function InventoryField({
  label, value, onChange, needed,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  needed: number
}) {
  const num = parseInt(value) || 0
  const ok = num >= needed
  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
        className={`w-20 border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 ${
          ok ? 'border-emerald-200 focus:ring-emerald-200' : 'border-gray-200 focus:ring-primary/30'
        }`}
      />
      {num > 0 && (
        <span className={`text-xs font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
          {ok ? '✓ ok' : `need ${needed - num} more`}
        </span>
      )}
    </div>
  )
}

function InventoryRow({
  label, value, onChange, needed, onSiteNum,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  needed: number
  onSiteNum: number
}) {
  const ok = onSiteNum >= needed
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">On site:</span>
        <input
          type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
          className={`w-20 border rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 ${
            ok && onSiteNum > 0 ? 'border-emerald-200 focus:ring-emerald-200' : 'border-gray-200 focus:ring-primary/30'
          }`}
        />
        {onSiteNum > 0 && (
          <span className={`text-xs font-medium ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>
            {ok ? '✓' : `need ${needed - onSiteNum} more`}
          </span>
        )}
      </div>
    </div>
  )
}

function MatChip({ label, value, sub, ok }: { label: string; value: string; sub?: string; ok?: boolean }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-800 mt-0.5">{value}</p>
      {sub && (
        <p className={`text-[10px] mt-0.5 ${ok ? 'text-emerald-600' : 'text-amber-600'}`}>{sub}</p>
      )}
    </div>
  )
}
