'use client'

import { useState } from 'react'
import type { ReportPeriod } from '@/lib/reports'
import type { BrewHistoryItem, PackedRun } from '@/lib/history'
import { PackedSummary } from './PackedSummary'
import { Insights } from './Insights'

/** The period pills drive both the packed totals and the insights under them. */
export function HistoryTop({ runs, items }: { runs: PackedRun[]; items: BrewHistoryItem[] }) {
  const [period, setPeriod] = useState<ReportPeriod>('this_month')
  return (
    <>
      <PackedSummary runs={runs} period={period} onPeriod={setPeriod} />
      <Insights items={items} period={period} />
    </>
  )
}
