'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Package, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { packageBrew, getBrewCogs } from '@/app/brews/actions'
import { PACKAGE_FORMATS } from '@/types'
import type { Brew, Tank, PackageFormat } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  onClose: () => void
}

type Qtys = Record<PackageFormat, string>
const EMPTY_QTYS: Qtys = { '24x375': '', '16x440': '', keg30: '', keg50: '' }

function NumInput({
  label, value, onChange, unit, placeholder = '—', step = '0.01',
}: {
  label: string; value: string; onChange: (v: string) => void
  unit?: string; placeholder?: string; step?: string
}) {
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pr-8"
        />
        {unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">{unit}</span>
        )}
      </div>
    </div>
  )
}

function StockRow({ label, kegs, cartons, onKegs, onCartons }: {
  label: string; kegs: string; cartons: string
  onKegs: (v: string) => void; onCartons: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 w-28 flex-shrink-0">{label}</span>
      <div className="flex-1">
        <input type="number" min="0" step="1" value={kegs} onChange={e => onKegs(e.target.value)}
          placeholder="0"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <div className="flex-1">
        <input type="number" min="0" step="1" value={cartons} onChange={e => onCartons(e.target.value)}
          placeholder="0"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
    </div>
  )
}

export function PackageModal({ brew, tank, onClose }: Props) {
  const [batchCode, setBatchCode] = useState(brew.batch_code ?? '')
  const [bestBefore, setBestBefore] = useState('')
  const [qtys, setQtys] = useState<Qtys>(EMPTY_QTYS)
  const [notes, setNotes] = useState('')

  // QC readings
  const [qcOpen, setQcOpen] = useState(true)
  const [bbtTemp, setBbtTemp] = useState('')
  const [bbtCo2, setBbtCo2] = useState('')
  const [bbtDo, setBbtDo] = useState('')
  const [canCo2, setCanCo2] = useState('')
  const [canDo, setCanDo] = useState('')
  const [undersSor, setUndersSor] = useState('')

  // Stock distribution
  const [stockOpen, setStockOpen] = useState(true)
  const [venueKegs, setVenueKegs] = useState('')
  const [venueCartons, setVenueCartons] = useState('')
  const [optionsKegs, setOptionsKegs] = useState('')
  const [optionsCartons, setOptionsCartons] = useState('')
  const [salesKegs, setSalesKegs] = useState('')
  const [salesCartons, setSalesCartons] = useState('')

  const [cogs, setCogs] = useState<Awaited<ReturnType<typeof getBrewCogs>> | null>(null)
  const [cogsLoading, setCogsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCogsLoading(true)
    getBrewCogs(brew.id).then(setCogs).finally(() => setCogsLoading(false))
  }, [brew.id])

  const totalVolumeL = PACKAGE_FORMATS.reduce((sum, f) => {
    const q = parseInt(qtys[f.format]) || 0
    return sum + q * f.volume_l
  }, 0)

  const totalCogs =
    cogs?.costPerL != null && totalVolumeL > 0
      ? cogs.costPerL * totalVolumeL
      : null

  const hasPackages = PACKAGE_FORMATS.some(f => parseInt(qtys[f.format]) > 0)
  const canSubmit = hasPackages && batchCode.trim().length > 0

  function n(s: string): number | null {
    const v = parseFloat(s)
    return isNaN(v) ? null : v
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const packages = PACKAGE_FORMATS
      .filter(f => parseInt(qtys[f.format]) > 0)
      .map(f => ({
        format: f.format,
        qty: parseInt(qtys[f.format]),
        volume_l: parseInt(qtys[f.format]) * f.volume_l,
      }))
    startTransition(async () => {
      await packageBrew({
        brew_id: brew.id,
        tank_id: tank.id,
        packages,
        notes,
        batch_code: batchCode.trim(),
        best_before_date: bestBefore || null,
        bbt_temp_c: n(bbtTemp),
        bbt_co2_vol: n(bbtCo2),
        bbt_do_ppb: n(bbtDo),
        can_co2_vol: n(canCo2),
        can_do_ppb: n(canDo),
        unders_sor: undersSor.trim() || null,
        stock_venue_kegs: n(venueKegs),
        stock_venue_cartons: n(venueCartons),
        stock_options_kegs: n(optionsKegs),
        stock_options_cartons: n(optionsCartons),
        stock_sales_kegs: n(salesKegs),
        stock_sales_cartons: n(salesCartons),
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Package {brew.beer_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {[brew.batch_code ? `Batch ${brew.batch_code}` : null, `${brew.volume_l} L available`]
                .filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {/* Batch + best before */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Batch number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={batchCode}
                  onChange={e => setBatchCode(e.target.value)}
                  placeholder="e.g. 376"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Best before</label>
                <input
                  type="date"
                  value={bestBefore}
                  onChange={e => setBestBefore(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Format quantities */}
            <div className="space-y-2">
              {PACKAGE_FORMATS.map(f => {
                const q = parseInt(qtys[f.format]) || 0
                return (
                  <div key={f.format} className="flex items-center gap-3">
                    <label className="text-sm text-gray-700 w-36 flex-shrink-0">{f.label}</label>
                    <input
                      type="number"
                      value={qtys[f.format]}
                      onChange={e => setQtys(prev => ({ ...prev, [f.format]: e.target.value }))}
                      min="0"
                      step="1"
                      placeholder="0"
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <span className="text-xs text-gray-400 tabular-nums w-16">
                      {q > 0 ? `${(q * f.volume_l).toFixed(1)} L` : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Summary */}
            {totalVolumeL > 0 && (
              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total packaged</span>
                  <span className="font-semibold text-gray-900">{totalVolumeL.toFixed(1)} L</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Yield</span>
                  <span className="font-medium text-gray-700">
                    {((totalVolumeL / brew.volume_l) * 100).toFixed(1)}%
                  </span>
                </div>
                {cogsLoading ? (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 border-t border-gray-200">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculating COGS…
                  </div>
                ) : totalCogs != null ? (
                  <div className="flex justify-between pt-1 border-t border-gray-200">
                    <span className="text-gray-500">Est. COGS</span>
                    <span className="font-semibold text-gray-900">
                      ${totalCogs.toFixed(2)}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        (${(totalCogs / totalVolumeL).toFixed(2)}/L)
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* COGS breakdown */}
            {!cogsLoading && cogs !== null && (
              <details className="text-xs" open={cogs.costPerL == null}>
                <summary className="text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                  {(() => {
                    if (!cogs.breakdown.length) return 'No recipe linked — COGS unavailable'
                    const priced = cogs.breakdown.filter(b => b.cost != null).length
                    const total = cogs.breakdown.length
                    return priced === total
                      ? `Ingredient costs (${total})`
                      : `Ingredient costs — ${priced}/${total} priced`
                  })()}
                </summary>
                <div className="mt-2 rounded-lg border border-gray-100 overflow-hidden">
                  {cogs.breakdown.length === 0 ? (
                    <p className="px-3 py-2 text-gray-400 italic">No ingredients on this recipe.</p>
                  ) : (
                    <table className="w-full">
                      <tbody>
                        {cogs.breakdown.map((b, i) => {
                          const missing = b.cost == null
                          const reason = b.unlinked ? 'not in library' : b.pricePerUnit == null ? 'no price set' : 'unit mismatch'
                          return (
                            <tr key={i} className={`border-b border-gray-50 last:border-0 ${missing ? 'opacity-60' : ''}`}>
                              <td className="px-3 py-1.5 text-gray-700">
                                {b.name}
                                {b.quantity != null && (
                                  <span className="text-gray-400 ml-1">{b.quantity}{b.unit ? ` ${b.unit}` : ''}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">
                                {b.cost != null
                                  ? <span className="text-gray-800 font-medium">${b.cost.toFixed(2)}</span>
                                  : <span className="text-amber-500 text-[10px] font-medium uppercase tracking-wide">{reason}</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {totalCogs != null && (
                        <tfoot className="bg-gray-50 border-t border-gray-100">
                          <tr>
                            <td className="px-3 py-1.5 text-gray-500 font-medium">Total</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-gray-800 tabular-nums">${totalCogs.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  )}
                  {cogs.breakdown.length > 0 && cogs.breakdown.some(b => b.cost == null) && (
                    <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 text-[10px] text-amber-700 leading-relaxed">
                      {cogs.breakdown.some(b => b.unlinked)
                        ? "Some ingredients aren't linked to the library. Edit the recipe and re-select them."
                        : 'Some ingredients have no price. Go to Ingredients → edit and add a price.'}
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>

          {/* BBT / CAN QC READINGS */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setQcOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">QC Readings</span>
              {qcOpen
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {qcOpen && (
              <div className="px-5 pb-4 space-y-3">
                <p className="text-[11px] text-gray-400">BBT</p>
                <div className="flex gap-2">
                  <NumInput label="Temp" value={bbtTemp} onChange={setBbtTemp} unit="°C" />
                  <NumInput label="CO₂" value={bbtCo2} onChange={setBbtCo2} unit="vol" />
                  <NumInput label="DO" value={bbtDo} onChange={setBbtDo} unit="ppb" />
                </div>
                <p className="text-[11px] text-gray-400 pt-1">Can</p>
                <div className="flex gap-2">
                  <NumInput label="CO₂" value={canCo2} onChange={setCanCo2} unit="vol" />
                  <NumInput label="DO" value={canDo} onChange={setCanDo} unit="ppb" />
                  <div className="flex-1 min-w-0">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Unders/SOR</label>
                    <input
                      type="text"
                      value={undersSor}
                      onChange={e => setUndersSor(e.target.value)}
                      placeholder="—"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* STOCK DISTRIBUTION */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStockOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock Distribution</span>
              {stockOpen
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {stockOpen && (
              <div className="px-5 pb-4 space-y-2">
                {/* Column headers */}
                <div className="flex items-center gap-2">
                  <span className="w-28 flex-shrink-0" />
                  <span className="flex-1 text-center text-[11px] font-medium text-gray-400">Kegs</span>
                  <span className="flex-1 text-center text-[11px] font-medium text-gray-400">Cartons</span>
                </div>
                <StockRow label="At venue"
                  kegs={venueKegs} cartons={venueCartons}
                  onKegs={setVenueKegs} onCartons={setVenueCartons} />
                <StockRow label="At Options"
                  kegs={optionsKegs} cartons={optionsCartons}
                  onKegs={setOptionsKegs} onCartons={setOptionsCartons} />
                <StockRow label="Taken by sales"
                  kegs={salesKegs} cartons={salesCartons}
                  onKegs={setSalesKegs} onCartons={setSalesCartons} />
              </div>
            )}
          </div>

          {/* Notes + submit */}
          <div className="p-5 pt-3 space-y-4 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Line down 20 mins, 50 L waste"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                {isPending ? 'Logging…' : 'Log Packaging'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
