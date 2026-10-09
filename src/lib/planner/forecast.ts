// Stock and run-out forecast for the planner. Stock on hand, draw rate, packs
// and brews come from the Sales App's own calculation (copied in sales-app/),
// so "Now" always matches its Stock page. On top of that the planner adds a
// seasonally adjusted run-out date, using the index in SEASONAL_INDEX.


import { loadStockInputs, computeStockRows, makeFlags } from './sales-app/stock'

import { getBrewSchedule } from './sales-app/splits'
import { dayKey } from './google'

// From 12 months of Xero wholesale revenue (Sep 2025 - Aug 2026), month / mean.
// One year of data, so it mixes season with the YoY decline. Refresh each spring.
// Source: .claude/skills/production-forecast/reference.md
export const SEASONAL_INDEX = [0.62, 0.78, 1.16, 0.78, 0.95, 0.77, 0.79, 0.69, 1.34, 1.07, 1.34, 1.71] // Jan..Dec

const WINDOW_WEEKS = 8

type Row = {
  code: string; name: string; short: string; format: string; brand: string; keg: boolean
  soh: number | null; pre: number; owed: number; available: number | null; perWeek: number
  weeks: number | null; runOut: Date | null; band: string; gapDays: number
  next: { date: Date; qty: number | null; beer: string } | null
  incoming: { date: Date; qty: number | null; beer: string }[]
  brew: { date: Date; title: string } | null
  reserved: { customer_name: string; qty: number; expected_date: string }[]
  unconfirmedQty: number
  oneOffs: { qty: number; customer_name: string; order_date: string }[]
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const r1 = (n: number) => Math.round(n * 10) / 10

/** Day the stock runs out if weekly draw follows the seasonal index (rate measured over the last 8 weeks). */
function seasonalRunOut(available: number, perWeek: number, today: Date) {
  if (perWeek <= 0 || available <= 0) return null
  let base = 0
  for (let i = 0; i < WINDOW_WEEKS * 7; i++) base += SEASONAL_INDEX[addDays(today, -i).getMonth()]
  base /= WINDOW_WEEKS * 7
  let left = available
  for (let i = 1; i <= 540; i++) {
    const d = addDays(today, i)
    left -= (perWeek / 7) * (SEASONAL_INDEX[d.getMonth()] / base)
    if (left <= 0) return d
  }
  return null
}

export async function stockForecast(today: Date) {
  const inputs = await loadStockInputs(today)
  let schedule: unknown[] = []
  let scheduleError: string | null = null
  try { schedule = await getBrewSchedule(null, today) } catch (e) { scheduleError = (e as Error).message }

  // The Stock page passes [] when the Splits sheet can't be read; null would crash packsForSku
  const rows = (computeStockRows as (args: unknown) => unknown)({
    ...inputs, packs: inputs.packs || [], schedule, windowWeeks: WINDOW_WEEKS, today,
  }) as Row[]
  const { isLimited, isRetired, offSeason, seasonOf } = makeFlags({ ...inputs, today })

  const out = rows
    .filter((r) => !isRetired(r.brand))
    .filter((r) => !(r.band === 'dormant' && !r.next && !r.brew)) // nothing on hand, nothing selling, nothing planned
    .map((r) => {
      const seasonal = r.available != null ? seasonalRunOut(r.available, r.perWeek, today) : null
      const flat = r.runOut
      const dates = [flat, seasonal].filter(Boolean) as Date[]
      const earliest = dates.length ? new Date(Math.min(...dates.map((d) => +d))) : null
      const latest = dates.length ? new Date(Math.max(...dates.map((d) => +d))) : null
      // Stock just after the next pack lands, at the flat rate
      let afterNextPack: number | null = null
      if (r.next && r.available != null && r.next.qty != null) {
        const weeksToPack = Math.max((+r.next.date - +today) / (7 * 86400000), 0)
        afterNextPack = Math.round(Math.max(r.available - r.perWeek * weeksToPack, 0) + r.next.qty)
      }
      return {
        sku: r.code,
        beer: r.short,
        format: r.format,
        range: isLimited(r.brand) ? 'limited' : seasonOf(r.brand) ? `seasonal (${seasonOf(r.brand)})${offSeason(r) ? ', off season' : ''}` : 'core/ongoing',
        now: r.soh, // matches the Sales App Stock page
        preordered: r.pre || undefined,
        held_for_expected_orders: r.reserved.length
          ? r.reserved.map((e) => `${e.qty} for ${e.customer_name} ~${e.expected_date}`).join('; ') : undefined,
        packed_not_yet_counted: r.unconfirmedQty || undefined,
        available: r.available,
        per_week: r1(r.perWeek),
        one_off_big_orders_excluded_from_rate: r.oneOffs.length ? r.oneOffs.map((l) => `${l.qty} ${l.customer_name} ${l.order_date}`).join('; ') : undefined,
        weeks_cover: r.weeks == null ? null : r1(r.weeks),
        run_out_flat: flat ? dayKey(flat) : null,
        run_out_seasonal: seasonal ? dayKey(seasonal) : null,
        run_out_window: earliest && latest ? `${dayKey(earliest)} to ${dayKey(latest)}` : null,
        band: r.band,
        next_pack: r.next ? { date: dayKey(r.next.date), qty: r.next.qty, from: r.next.beer } : null,
        later_packs: r.incoming.slice(1).map((p) => ({ date: dayKey(p.date), qty: p.qty })),
        brew_feeding_next_pack: r.brew ? { date: dayKey(r.brew.date), title: r.brew.title } : null,
        stock_after_next_pack_est: afterNextPack,
        days_dry_before_next_pack: r.gapDays || undefined,
      }
    })

  return {
    as_of: dayKey(today),
    rate_basis: `Every Sales App order line (wholesale + taproom/festival transfers) over the last ${WINDOW_WEEKS} weeks, or weeks on sale for a new release. Big one-off orders are left out of the rate.`,
    seasonal_index_jan_to_dec: SEASONAL_INDEX,
    caveats: [
      'Taproom draught pulls that were never logged as transfers are missed, so keg run-out dates are the latest possible, not expected.',
      'Seasonal index is one year of Xero wholesale revenue and is mixed up with the year-on-year decline. Treat the window, not a single date.',
      ...(scheduleError ? [`Brewery Schedule could not be read: ${scheduleError}`] : []),
      ...(inputs.packs ? [] : ['Packaging Splits sheet could not be read - incoming packs come from the calendar only.']),
    ],
    skus: out,
  }
}
