'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import type { ReportPeriod, PackagingReportData } from '@/lib/reports'
import { getPeriodRange } from '@/lib/reports'
import { getPackagingReportAction } from './actions'

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'this_month',    label: 'This Month' },
  { id: 'last_month',    label: 'Last Month' },
  { id: 'ytd_calendar',  label: 'Calendar YTD' },
  { id: 'ytd_financial', label: 'Financial YTD' },
]

interface Props {
  initialPeriod: ReportPeriod
  initialData: PackagingReportData
}

export function PackagingReport({ initialPeriod, initialData }: Props) {
  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod)
  const [data, setData] = useState(initialData)
  const [isPending, startTransition] = useTransition()

  function switchPeriod(p: ReportPeriod) {
    setPeriod(p)
    startTransition(async () => {
      const result = await getPackagingReportAction(p)
      setData(result)
    })
  }

  const periodLabel = getPeriodRange(period).label

  // Keg + carton breakdowns
  const byFormat = (fmt: string) => data.rows.filter(r => r.format === fmt)
  const fmtQty   = (fmt: string) => byFormat(fmt).reduce((s, r) => s + r.total_qty, 0)

  const keg30  = fmtQty('keg30')
  const keg50  = fmtQty('keg50')
  const c24    = fmtQty('24x375')
  const c16    = fmtQty('16x440')
  const totalKegs     = keg30 + keg50
  const totalCartons  = c24 + c16

  // Group rows by beer for visual grouping
  const grouped: { beer_name: string; style: string | null; rows: typeof data.rows }[] = []
  for (const row of data.rows) {
    const last = grouped[grouped.length - 1]
    if (last?.beer_name === row.beer_name) {
      last.rows.push(row)
    } else {
      grouped.push({ beer_name: row.beer_name, style: row.style, rows: [row] })
    }
  }

  return (
    <div>
      {/* Period selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {PERIODS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => switchPeriod(p.id)}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.id
                ? 'bg-primary text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
          >
            {p.label}
          </button>
        ))}
        {isPending && <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-1" />}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Period',         value: periodLabel },
          { label: 'Packaging Runs', value: String(data.total_runs) },
          { label: 'Total Volume',   value: `${data.total_volume_l.toFixed(1)} L` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
          </div>
        ))}

        {/* Kegs */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Total Kegs</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{totalKegs}</p>
          {totalKegs > 0 && (
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              {[keg30 > 0 && `${keg30}×30L`, keg50 > 0 && `${keg50}×50L`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        {/* Cartons */}
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Total Cartons</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{totalCartons}</p>
          {totalCartons > 0 && (
            <p className="text-xs text-gray-400 mt-1 tabular-nums">
              {[c24 > 0 && `${c24}×24pk`, c16 > 0 && `${c16}×16pk`].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Table */}
      {data.rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-20 text-center">
          <p className="text-gray-400 text-sm">No packaging recorded for this period.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Beer</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Style</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Batch</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Format</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Units</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">Volume</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, gi) =>
                group.rows.map((row, ri) => {
                  const isFirstInGroup = ri === 0
                  const isLastInGroup = ri === group.rows.length - 1
                  const isLastGroup = gi === grouped.length - 1

                  return (
                    <tr
                      key={`${group.beer_name}-${row.format}`}
                      className={`border-t border-gray-50 hover:bg-gray-50/40 ${
                        isFirstInGroup && gi > 0 ? 'border-t-gray-200' : ''
                      }`}
                    >
                      {/* Beer name — only on first row of group, spans visually */}
                      <td className="px-5 py-3 font-semibold text-gray-900">
                        {isFirstInGroup ? row.beer_name : ''}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {isFirstInGroup ? (row.style ?? '—') : ''}
                      </td>
                      <td className="px-5 py-3 text-gray-500 tabular-nums">
                        {row.batch_code ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{row.format_label}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-gray-700">{row.total_qty}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-medium text-gray-900">
                        {row.total_volume_l.toFixed(1)} L
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-gray-700">Total</td>
                <td className="px-5 py-3 text-right tabular-nums font-semibold text-gray-700">
                  {data.rows.reduce((s, r) => s + r.total_qty, 0)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900">
                  {data.total_volume_l.toFixed(1)} L
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
