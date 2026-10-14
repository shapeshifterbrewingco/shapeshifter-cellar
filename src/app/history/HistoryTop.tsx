'use client'

import { useMemo, useState } from 'react'
import { getPeriodRange } from '@/lib/reports'
import type { PeriodRange, ReportPeriod } from '@/lib/reports'
import { addDaysISO, breweryInstant, breweryToday } from '@/lib/dates'
import type { BrewHistoryItem, PackedRun } from '@/lib/history'
import { PackedSummary } from './PackedSummary'
import { Insights } from './Insights'

export type HistoryPeriod = ReportPeriod | 'custom'

const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/** A brewery-local date range, both days included. Null until both ends are valid and in order. */
function customRange(from: string, to: string): PeriodRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = addDaysISO(to, 1).split('-').map(Number)
  return {
    // Written to follow "packed in"
    label: from === to ? `the day of ${day(from)}` : `the period ${day(from)} to ${day(to)}`,
    start: breweryInstant(fy, fm - 1, fd),
    // One second before the day after the end date starts
    end: new Date(breweryInstant(ty, tm - 1, td).getTime() - 1000),
  }
}

/** The period pills drive both the packed totals and the insights under them. */
export function HistoryTop({ runs, items }: { runs: PackedRun[]; items: BrewHistoryItem[] }) {
  const [period, setPeriod] = useState<HistoryPeriod>('this_month')
  const today = breweryToday()
  // Starts on the last three months: a range that already shows something
  const [from, setFrom] = useState(() => addDaysISO(today, -90))
  const [to, setTo] = useState(today)

  const picked = useMemo(() => customRange(from, to), [from, to])
  const range = useMemo(() => (period === 'custom' ? picked : getPeriodRange(period)), [period, picked])

  const DATE = 'w-full h-11 rounded-xl bg-white ring-1 ring-black/5 px-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40'
  const dates = period === 'custom' ? (
    <div className="mb-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="block px-1 mb-1 text-xs text-gray-500">From</span>
          <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className={DATE} />
        </label>
        <label className="block min-w-0">
          <span className="block px-1 mb-1 text-xs text-gray-500">To</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={DATE} />
        </label>
      </div>
      {!picked && <p className="px-1 mt-1.5 text-xs text-malt-dark">Pick a From date that is on or before the To date.</p>}
    </div>
  ) : null

  return (
    <>
      <PackedSummary runs={runs} period={period} onPeriod={setPeriod} range={range} dates={dates} />
      {range && <Insights items={items} range={range} />}
    </>
  )
}
