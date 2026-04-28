'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Package, Loader2 } from 'lucide-react'
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

export function PackageModal({ brew, tank, onClose }: Props) {
  const [batchCode, setBatchCode] = useState(brew.batch_code ?? '')
  const [qtys, setQtys] = useState<Qtys>(EMPTY_QTYS)
  const [notes, setNotes] = useState('')
  const [cogs, setCogs] = useState<Awaited<ReturnType<typeof getBrewCogs>> | null>(null)
  const [cogsLoading, setCogsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setCogsLoading(true)
    getBrewCogs(brew.id)
      .then(setCogs)
      .finally(() => setCogsLoading(false))
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
      await packageBrew({ brew_id: brew.id, tank_id: tank.id, packages, notes, batch_code: batchCode.trim() })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Package {brew.beer_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                brew.batch_code ? `Batch ${brew.batch_code}` : null,
                `${brew.volume_l}L available`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Batch number */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Batch number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={batchCode}
              onChange={e => setBatchCode(e.target.value)}
              placeholder="e.g. 2026-001"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Format inputs */}
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
                    {q > 0 ? `${(q * f.volume_l).toFixed(1)}L` : ''}
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
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Calculating COGS…
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

          {/* COGS breakdown — always shown once loaded */}
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
                              {b.cost != null ? (
                                <span className="text-gray-800 font-medium">${b.cost.toFixed(2)}</span>
                              ) : (
                                <span className="text-amber-500 text-[10px] font-medium uppercase tracking-wide">{reason}</span>
                              )}
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
                      ? 'Some ingredients aren\'t linked to the library. Edit the recipe and re-select them from the autocomplete, then add prices in Ingredients.'
                      : 'Some ingredients have no price. Go to Ingredients → edit and add a price, or upload a supplier price list.'}
                  </div>
                )}
              </div>
            </details>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Line down 20 mins, 50L waste"
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
              disabled={isPending || !canSubmit}
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              {isPending ? 'Logging…' : 'Log Packaging'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
