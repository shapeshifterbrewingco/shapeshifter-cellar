'use client'

import { useMemo } from 'react'
import { getPeriodRange } from '@/lib/reports'
import type { ReportPeriod } from '@/lib/reports'
import type { PackedRun } from '@/lib/history'

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'this_month',    label: 'This month' },
  { id: 'last_month',    label: 'Last month' },
  { id: 'ytd_calendar',  label: 'Calendar year' },
  { id: 'ytd_financial', label: 'Financial year' },
  { id: 'all_time',      label: 'All time' },
]

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'

/** What was packed in a period: the numbers that used to live on the Reports page. */
export function PackedSummary({ runs, period, onPeriod: setPeriod }: { runs: PackedRun[]; period: ReportPeriod; onPeriod: (p: ReportPeriod) => void }) {

  const { label, totals } = useMemo(() => {
    const { label, start, end } = getPeriodRange(period)
    const t = { runs: 0, litres: 0, keg20: 0, keg30: 0, keg50: 0, c24: 0, c16: 0 }
    for (const r of runs) {
      const at = new Date(r.packaged_at).getTime()
      if (at < start.getTime() || at > end.getTime()) continue
      t.runs += 1
      t.litres += r.volume_l
      if (r.format === 'keg20') t.keg20 += r.qty
      else if (r.format === 'keg30') t.keg30 += r.qty
      else if (r.format === 'keg50') t.keg50 += r.qty
      else if (r.format === '24x375') t.c24 += r.qty
      else if (r.format === '16x440') t.c16 += r.qty
    }
    return { label, totals: t }
  }, [runs, period])

  const kegs = totals.keg20 + totals.keg30 + totals.keg50
  const cartons = totals.c24 + totals.c16
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: 'Volume packed', value: `${Math.round(totals.litres).toLocaleString('en-AU')} L`, sub: `${totals.runs} packaging run${totals.runs === 1 ? '' : 's'}` },
    { label: 'Cartons', value: cartons.toLocaleString('en-AU'), sub: [totals.c24 > 0 && `${totals.c24} × 24 pack`, totals.c16 > 0 && `${totals.c16} × 16 pack`].filter(Boolean).join(' · ') || 'None' },
    { label: 'Kegs', value: kegs.toLocaleString('en-AU'), sub: [totals.keg50 > 0 && `${totals.keg50} × 50 L`, totals.keg30 > 0 && `${totals.keg30} × 30 L`, totals.keg20 > 0 && `${totals.keg20} × 20 L`].filter(Boolean).join(' · ') || 'None' },
  ]

  return (
    <section className="mb-5" aria-label="Packed in the period">
      <div className="grid grid-cols-2 gap-1.5 mb-2 sm:flex sm:flex-wrap">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-center text-sm font-medium transition-colors last:col-span-2 ${period === p.id ? 'bg-primary text-white' : 'bg-white text-gray-600 ring-1 ring-black/5'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="px-1 mb-2 text-xs text-gray-500">Packed in {label}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {tiles.map((t, i) => (
          <div key={t.label} className={`${CARD} px-4 py-3 min-w-0 ${i === 0 ? 'col-span-2 md:col-span-1' : ''}`}>
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-gray-900">{t.value}</p>
            <p className="text-xs text-gray-400 tabular-nums break-words">{t.sub}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
