import type { SupabaseClient } from '@supabase/supabase-js'
import { PACKAGE_FORMATS } from '@/types'

export type ReportPeriod = 'this_month' | 'last_month' | 'ytd_calendar' | 'ytd_financial'

export interface PeriodRange {
  label: string
  start: Date
  end: Date
}

export function getPeriodRange(period: ReportPeriod, now = new Date()): PeriodRange {
  const y = now.getFullYear()
  const m = now.getMonth() // 0-indexed

  switch (period) {
    case 'this_month':
      return {
        label: now.toLocaleString('en-AU', { month: 'long', year: 'numeric' }),
        start: new Date(y, m, 1),
        end: new Date(now),
      }
    case 'last_month': {
      const lm = m === 0 ? 11 : m - 1
      const ly = m === 0 ? y - 1 : y
      return {
        label: new Date(ly, lm, 1).toLocaleString('en-AU', { month: 'long', year: 'numeric' }),
        start: new Date(ly, lm, 1),
        end: new Date(ly, lm + 1, 0, 23, 59, 59),
      }
    }
    case 'ytd_calendar':
      return {
        label: `Calendar YTD ${y}`,
        start: new Date(y, 0, 1),
        end: new Date(now),
      }
    case 'ytd_financial': {
      // Australian financial year: 1 Jul – 30 Jun
      const fyStart = m >= 6 ? new Date(y, 6, 1) : new Date(y - 1, 6, 1)
      const fyEndYear = fyStart.getFullYear() + 1
      return {
        label: `FY ${fyStart.getFullYear()}/${String(fyEndYear).slice(2)} YTD`,
        start: fyStart,
        end: new Date(now),
      }
    }
  }
}

export interface ReportRow {
  beer_name: string
  style: string | null
  batch_code: string | null
  format: string
  format_label: string
  runs: number
  total_qty: number
  total_volume_l: number
}

export interface PackagingReportData {
  rows: ReportRow[]
  total_volume_l: number
  total_runs: number
}

export async function getPackagingReport(
  supabase: SupabaseClient,
  period: ReportPeriod
): Promise<PackagingReportData> {
  const { start, end } = getPeriodRange(period)

  const { data, error } = await supabase
    .from('packaging_runs')
    .select(`
      id, format, qty, volume_l, packaged_at,
      brews(beer_name, style, batch_code)
    `)
    .gte('packaged_at', start.toISOString())
    .lte('packaged_at', end.toISOString())
    .order('packaged_at', { ascending: true })

  if (error) throw error
  if (!data?.length) return { rows: [], total_volume_l: 0, total_runs: 0 }

  // Aggregate by beer_name + style + format
  const map = new Map<string, ReportRow>()

  for (const run of data as any[]) {
    const brew = Array.isArray(run.brews) ? run.brews[0] : run.brews
    const beer_name: string = brew?.beer_name ?? 'Unknown'
    const style: string | null = brew?.style ?? null
    const batch_code: string | null = brew?.batch_code ?? null
    const fmt = PACKAGE_FORMATS.find(f => f.format === run.format)
    const key = `${beer_name}||${batch_code ?? ''}||${run.format}`

    if (!map.has(key)) {
      map.set(key, {
        beer_name,
        style,
        batch_code,
        format: run.format,
        format_label: fmt?.label ?? run.format,
        runs: 0,
        total_qty: 0,
        total_volume_l: 0,
      })
    }

    const row = map.get(key)!
    row.runs += 1
    row.total_qty += run.qty
    row.total_volume_l += run.volume_l
  }

  // Sort: by beer name then format
  const rows = Array.from(map.values()).sort((a, b) =>
    a.beer_name.localeCompare(b.beer_name) || a.format.localeCompare(b.format)
  )

  const total_volume_l = rows.reduce((s, r) => s + r.total_volume_l, 0)
  const total_runs = rows.reduce((s, r) => s + r.runs, 0)

  return { rows, total_volume_l, total_runs }
}
