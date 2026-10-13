// The monthly excise figures: litres of alcohol (LAL) packaged, split the way
// the return needs them. Beer and RTDs (hard lemonade) are different tariff
// items, and cans, kegs up to 48 L and kegs over 48 L are different again.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { breweryInstant, breweryToday } from '@/lib/dates'
import { calcAbv } from '@/lib/utils'
import { postSlack, slackConfigured } from '@/lib/slack'
import { isRtd } from '@/lib/rtd'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Beer excise is charged on the alcohol above this strength; RTDs on all of it
const BEER_FREE_ABV = 1.15

type Bucket = { litres: number; lal: number; dutiable: number }
const empty = (): Bucket => ({ litres: 0, lal: 0, dutiable: 0 })
const PACKS = ['cans', 'keg30', 'keg50'] as const
type Pack = (typeof PACKS)[number]
const PACK_LABEL: Record<Pack, string> = { cans: 'Cans', keg30: 'Kegs up to 30 L', keg50: 'Kegs 50 L' }

export interface ExciseReport {
  label: string
  beer: Record<Pack, Bucket>
  rtd: Record<Pack, Bucket>
  /** Batches counted at the recipe's target ABV because no final gravity was logged */
  estimated: string[]
  /** Batches left out: no ABV to be had */
  missing: string[]
  runs: number
}

/** Excise figures for one calendar month (month is 0 to 11), by the day each run was packaged. */
export async function exciseReport(supabase: SupabaseClient, year: number, month: number): Promise<ExciseReport> {
  const start = breweryInstant(year, month, 1)
  const end = breweryInstant(month === 11 ? year + 1 : year, (month + 1) % 12, 1)
  const { data, error } = await supabase
    .from('packaging_runs')
    .select('format, volume_l, brew_id, brews(beer_name, style, og_plato, batch_code, recipes(target_abv))')
    .gte('packaged_at', start.toISOString())
    .lt('packaged_at', end.toISOString())
  if (error) throw new Error(error.message)

  type Run = { format: string; volume_l: number; brew_id: string; brews: unknown }
  const runs = (data ?? []) as Run[]
  const ids = [...new Set(runs.map((r) => r.brew_id))]
  const { data: finals } = ids.length
    ? await supabase.from('brew_finals').select('brew_id, final_plato, reading_count').in('brew_id', ids)
    : { data: [] }
  const finalBy = new Map((finals ?? []).map((f) => [f.brew_id as string, f as { final_plato: number | null; reading_count: number }]))

  const report: ExciseReport = {
    label: `${MONTHS[month]} ${year}`,
    beer: { cans: empty(), keg30: empty(), keg50: empty() },
    rtd: { cans: empty(), keg30: empty(), keg50: empty() },
    estimated: [], missing: [], runs: runs.length,
  }
  const estimated = new Set<string>()
  const missing = new Set<string>()

  for (const run of runs) {
    const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null
    const brew = one(run.brews as { beer_name: string; style: string | null; og_plato: number | null; batch_code: string | null; recipes: unknown } | null)
    if (!brew) continue
    const tag = `${brew.beer_name}${brew.batch_code ? ` (${brew.batch_code})` : ''}`
    const final = finalBy.get(run.brew_id)
    const og = brew.og_plato != null ? Number(brew.og_plato) : null
    const fg = final?.final_plato != null ? Number(final.final_plato) : null
    // A measured ABV needs a real final gravity: more than the first reading, and below it
    let abv = og != null && fg != null && (final?.reading_count ?? 0) >= 2 && fg < og ? calcAbv(og, fg) : null
    if (abv == null) {
      const target = one(brew.recipes as { target_abv: number | null } | null)?.target_abv
      if (target != null) { abv = Number(target); estimated.add(tag) }
    }
    if (abv == null) { missing.add(tag); continue }

    const rtd = isRtd(brew.beer_name, brew.style)
    // 20 L and 30 L kegs are the same excise class (containers up to 48 L)
    const pack: Pack = run.format === 'keg30' || run.format === 'keg20' ? 'keg30' : run.format === 'keg50' ? 'keg50' : 'cans'
    const litres = Number(run.volume_l)
    const b = (rtd ? report.rtd : report.beer)[pack]
    b.litres += litres
    b.lal += (litres * abv) / 100
    b.dutiable += (litres * (rtd ? abv : Math.max(abv - BEER_FREE_ABV, 0))) / 100
  }
  report.estimated = [...estimated]
  report.missing = [...missing]
  return report
}

const n1 = (n: number) => n.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** The report as a Slack message. */
export function exciseMessage(r: ExciseReport): string {
  const section = (title: string, rows: Record<Pack, Bucket>, beer: boolean) => {
    const used = PACKS.filter((p) => rows[p].litres > 0)
    if (!used.length) return `*${title}:* nothing packaged`
    const total = used.reduce((t, p) => ({ litres: t.litres + rows[p].litres, lal: t.lal + rows[p].lal, dutiable: t.dutiable + rows[p].dutiable }), empty())
    const line = (name: string, b: Bucket) =>
      `• ${name}: ${n1(b.lal)} LAL from ${Math.round(b.litres).toLocaleString('en-AU')} L${beer ? ` (${n1(b.dutiable)} LAL above ${BEER_FREE_ABV}%)` : ''}`
    return [`*${title}*`, ...used.map((p) => line(PACK_LABEL[p], rows[p])), line('Total', total)].join('\n')
  }
  const lines = [
    `*Excise figures for ${r.label}* (packaged in the month, ${r.runs} packaging run${r.runs === 1 ? '' : 's'})`,
    section('Beer', r.beer, true),
    section('RTD (hard lemonade)', r.rtd, false),
  ]
  if (r.estimated.length) lines.push(`_Recipe target ABV used, no final gravity logged:_ ${r.estimated.join(', ')}`)
  if (r.missing.length) lines.push(`*Left out, no ABV on file:* ${r.missing.join(', ')}`)
  return lines.join('\n\n')
}

/**
 * Post last month's figures once, on or after the 18th. Run by the poller, so
 * if the 18th is missed it goes out the next time the poller runs.
 */
export async function sendExciseReportIfDue(now = new Date()): Promise<boolean> {
  if (!slackConfigured()) return false
  const today = breweryToday(now)
  if (Number(today.slice(8, 10)) < 18) return false
  const hour = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', hour: 'numeric', hourCycle: 'h23' }).format(now))
  if (hour < 8) return false

  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1
  const year = m === 0 ? y - 1 : y, month = m === 0 ? 11 : m - 1
  // "meta:" keys are left alone by the alarm clean-up
  const key = `meta:excise:${year}-${String(month + 1).padStart(2, '0')}`
  const db = createServiceClient()
  const { data: done } = await db.from('alert_state').select('key').eq('key', key).maybeSingle()
  if (done) return false

  const sent = await postSlack(exciseMessage(await exciseReport(db, year, month)))
  if (sent) await db.from('alert_state').insert({ key, message: 'excise report sent', notified_at: new Date().toISOString() })
  return sent
}
