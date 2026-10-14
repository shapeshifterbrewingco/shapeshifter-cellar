'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { breweryToday, daysBetweenISO } from '@/lib/dates'
import { DO_SPEC, doWorst } from '@/lib/history'
import type { BrewHistoryItem } from '@/lib/history'
import { yearBg } from './year-colour'
import type { PeriodRange } from '@/lib/reports'

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`

type View = 'yield' | 'time' | 'oxygen' | 'strength' | 'volume'
const VIEWS: { id: View; label: string }[] = [
  { id: 'yield', label: 'Yield' },
  { id: 'time', label: 'Time in tank' },
  { id: 'oxygen', label: 'Oxygen' },
  { id: 'strength', label: 'Strength' },
  { id: 'volume', label: 'Volume' },
]

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const dp = (n: number | null, d = 1) => (n == null ? '-' : n.toFixed(d))
const mid = (low: number | null, high: number | null) => (low == null && high == null ? null : (Number(low ?? high) + Number(high ?? low)) / 2)
const isLager = (style: string | null) => /lager|pils|helles|kolsch|kölsch|märzen|marzen|festbier/i.test(style ?? '')
const isRtd = (i: BrewHistoryItem) => /lemonade|seltzer|\brtd\b/i.test(`${i.beer_name} ${i.style ?? ''}`)

interface Row { item: BrewHistoryItem; yieldPct: number | null; days: number | null; packDo: number | null; briteDo: number | null; packWorst: number | null; briteWorst: number | null; abvGap: number | null; ogGap: number | null }

/** Groups rows by beer and averages one number, keeping beers with enough batches to mean something. */
function byBeer(rows: Row[], pick: (r: Row) => number | null, min = 2) {
  const map = new Map<string, number[]>()
  for (const r of rows) {
    const v = pick(r)
    if (v != null) map.set(r.item.beer_name, [...(map.get(r.item.beer_name) ?? []), v])
  }
  return [...map.entries()].filter(([, v]) => v.length >= min).map(([beer, v]) => ({ beer, n: v.length, avg: mean(v)! }))
}

function Bar({ label, sub, value, pct, bg = 'bg-primary' }: { label: string; sub?: string; value: string; pct: number; bg?: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-gray-900">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</p>
        <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-gray-900">{value}</p>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-black/5"><div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
    </li>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  )
}

function Headline({ value, text, note }: { value: string; text: string; note?: string }) {
  return (
    <div>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-gray-900">{value}</p>
      <p className="text-sm text-gray-600">{text}</p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  )
}

/** What the finished batches say when you add them up. Hidden until asked for. */
export function Insights({ items, range }: { items: BrewHistoryItem[]; range: PeriodRange }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('yield')

  const rows = useMemo<Row[]>(() => {
    const inRange = items.filter((i) => {
      if (!(i.packed_l > 0) || !i.packed_at) return false
      const at = new Date(i.packed_at).getTime()
      return at >= range.start.getTime() && at <= range.end.getTime()
    })
    // Two tanks of the same beer packed on the same day run through the line as one
    // lot, and the paper report puts the cartons on whichever sheet was to hand. The
    // split between them is not real, so their yield is worked out together.
    const lot = (i: BrewHistoryItem) => `${i.beer_name}|${breweryToday(new Date(i.packed_at!))}`
    const pooled = new Map<string, { packed: number; fv: number }>()
    for (const i of inRange) {
      const t = pooled.get(lot(i)) ?? { packed: 0, fv: 0 }
      pooled.set(lot(i), { packed: t.packed + i.packed_l, fv: t.fv + (i.fv_volume_l > 0 ? i.fv_volume_l : NaN) })
    }
    return inRange.map((item) => {
    const both = pooled.get(lot(item))!
    const y = both.fv > 0 ? (both.packed / both.fv) * 100 : null
    return {
      item,
      // Blends and barrel pulls pack far more or far less than went into the tank; they are not a yield
      yieldPct: y != null && y >= 30 && y <= 110 ? y : null,
      days: daysBetweenISO(item.brew_day, breweryToday(new Date(item.packed_at!))),
      // Hard lemonade reads around 400 ppb, ten times a beer. It is a different
      // product with a different limit, so it stays out of the oxygen figures.
      packDo: isRtd(item) ? null : mid(item.report?.pack_do_ppb ?? null, item.report?.pack_do_ppb_high ?? null),
      briteDo: isRtd(item) ? null : mid(item.report?.bbt_do_ppb ?? null, item.report?.bbt_do_ppb_high ?? null),
      packWorst: isRtd(item) ? null : doWorst(item.report?.pack_do_ppb, item.report?.pack_do_ppb_high),
      briteWorst: isRtd(item) ? null : doWorst(item.report?.bbt_do_ppb, item.report?.bbt_do_ppb_high),
      abvGap: item.abv != null && item.target_abv != null && item.abv > 0 ? item.abv - item.target_abv : null,
      ogGap: item.og_plato != null && item.target_og_plato != null ? item.og_plato - item.target_og_plato : null,
    }
    })
  }, [items, range])

  // Averages off one or two batches would read as facts they are not
  const enough = rows.length >= 3
  const tag = (r: Row) => `${r.item.batch_code ? `${r.item.batch_code} ` : ''}${r.item.beer_name}`

  function body() {
    if (view === 'yield') {
      const ys = rows.filter((r) => r.yieldPct != null)
      const avg = mean(ys.map((r) => r.yieldPct!))
      if (avg == null) return <p className="text-sm text-gray-500">No batches with both a tank volume and a packed volume yet.</p>
      const low = [...ys].sort((a, b) => a.yieldPct! - b.yieldPct!).slice(0, 5)
      const beers = byBeer(rows, (r) => r.yieldPct, 3).sort((a, b) => b.avg - a.avg)
      return (
        <>
          <Headline value={`${Math.round(avg)}%`} text={`of what goes into a fermenter ends up in cans and kegs. About ${Math.round(1000 - avg * 10)} L of every 1,000 L is lost to hops, yeast and the lines.`} note={`${ys.length} batches. Blends are left out.`} />
          <Block title="Lowest yields">{low.map((r) => <Bar key={r.item.id} label={tag(r)} sub={r.item.style ?? undefined} value={`${Math.round(r.yieldPct!)}%`} pct={r.yieldPct!} bg="bg-malt" />)}</Block>
          {beers.length > 0 && <Block title="Average by beer (3 or more batches)">{beers.map((b) => <Bar key={b.beer} label={b.beer} sub={`${b.n} batches`} value={`${Math.round(b.avg)}%`} pct={b.avg} />)}</Block>}
        </>
      )
    }

    if (view === 'time') {
      const ds = rows.filter((r) => r.days != null && r.days > 0 && r.days < 200 && !isRtd(r.item))
      const avg = mean(ds.map((r) => r.days!))
      if (avg == null) return <p className="text-sm text-gray-500">Nothing to show yet.</p>
      const lager = mean(ds.filter((r) => isLager(r.item.style)).map((r) => r.days!))
      const ale = mean(ds.filter((r) => !isLager(r.item.style)).map((r) => r.days!))
      const beers = byBeer(ds, (r) => r.days).sort((a, b) => b.avg - a.avg)
      const max = Math.max(...beers.map((b) => b.avg), 1)
      const long = [...ds].sort((a, b) => b.days! - a.days!).slice(0, 5)
      return (
        <>
          <Headline value={`${Math.round(avg)} days`} text="from brew day to packaged, on average." note={`${ale != null ? `Ales ${Math.round(ale)} days` : ''}${ale != null && lager != null ? ' · ' : ''}${lager != null ? `lagers ${Math.round(lager)} days` : ''}. Hard lemonades and barrel beers are left out.`} />
          <Block title="Longest in the cellar">{long.map((r) => <Bar key={r.item.id} label={tag(r)} sub={r.item.style ?? undefined} value={`${r.days} days`} pct={(r.days! / long[0].days!) * 100} bg="bg-malt" />)}</Block>
          {beers.length > 0 && <Block title="Average by beer (2 or more batches)">{beers.map((b) => <Bar key={b.beer} label={b.beer} sub={`${b.n} batches`} value={`${Math.round(b.avg)} days`} pct={(b.avg / max) * 100} />)}</Block>}
        </>
      )
    }

    if (view === 'oxygen') {
      const ps = rows.filter((r) => r.packDo != null)
      const avg = mean(ps.map((r) => r.packDo!))
      if (avg == null) return <p className="text-sm text-gray-500">No packaging reports with a DO reading yet.</p>
      const brite = mean(rows.filter((r) => r.briteDo != null).map((r) => r.briteDo!))
      const high = [...ps].sort((a, b) => b.packDo! - a.packDo!).slice(0, 5)
      const months = new Map<string, number[]>()
      for (const r of ps) months.set(r.item.month, [...(months.get(r.item.month) ?? []), r.packDo!])
      const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ k, n: v.length, avg: mean(v)! }))
      const max = Math.max(...byMonth.map((m) => m.avg), ...high.map((r) => r.packDo!), 1)
      const packOk = ps.filter((r) => r.packWorst! < DO_SPEC.pack).length
      const bs = rows.filter((r) => r.briteWorst != null)
      const briteOk = bs.filter((r) => r.briteWorst! < DO_SPEC.brite).length
      const briteHigh = [...bs].filter((r) => r.briteWorst! >= DO_SPEC.brite).sort((a, b) => b.briteWorst! - a.briteWorst!).slice(0, 5)
      const briteMax = Math.max(...briteHigh.map((r) => r.briteWorst!), 1)
      return (
        <>
          <Headline value={`${packOk} of ${ps.length}`} text={`batches packed under ${DO_SPEC.pack} ppb of dissolved oxygen. The average is ${Math.round(avg)} ppb.`} note={`${bs.length ? `${briteOk} of ${bs.length} were under ${DO_SPEC.brite} ppb in the brite. ` : ''}${brite != null ? `The brite averages ${Math.round(brite)} ppb, so packaging adds about ${Math.round(avg - brite)} ppb. ` : ''}A batch counts as inside when its highest reading is under the line. Hard lemonades are left out.`} />
          <Block title="Highest in pack">{high.map((r) => <Bar key={r.item.id} label={tag(r)} sub={monthShort(r.item.month)} value={`${Math.round(r.packDo!)} ppb`} pct={(r.packDo! / max) * 100} bg="bg-malt" />)}</Block>
          {briteHigh.length > 0 && <Block title={`Over ${DO_SPEC.brite} ppb in the brite`}>{briteHigh.map((r) => <Bar key={r.item.id} label={tag(r)} sub={monthShort(r.item.month)} value={`${Math.round(r.briteWorst!)} ppb`} pct={(r.briteWorst! / briteMax) * 100} bg="bg-malt" />)}</Block>}
          <Block title="Average in pack by month">{byMonth.map((m) => <Bar key={m.k} label={monthShort(m.k)} sub={`${m.n} batch${m.n === 1 ? '' : 'es'}`} value={`${Math.round(m.avg)} ppb`} pct={(m.avg / max) * 100} bg={m.avg >= DO_SPEC.pack ? 'bg-malt' : yearBg(m.k)} />)}</Block>
        </>
      )
    }

    if (view === 'strength') {
      const gs = rows.filter((r) => r.abvGap != null && Math.abs(r.abvGap) < 1.5)
      if (gs.length === 0) return <p className="text-sm text-gray-500">No batches with a target ABV yet.</p>
      const within = gs.filter((r) => Math.abs(r.abvGap!) <= 0.3).length
      const ogs = rows.filter((r) => r.ogGap != null)
      const ogWithin = ogs.filter((r) => Math.abs(r.ogGap!) <= 0.3).length
      const ogOff = [...ogs].filter((r) => Math.abs(r.ogGap!) > 0.3).sort((a, b) => Math.abs(b.ogGap!) - Math.abs(a.ogGap!)).slice(0, 6)
      const off = [...gs].sort((a, b) => Math.abs(b.abvGap!) - Math.abs(a.abvGap!)).filter((r) => Math.abs(r.abvGap!) > 0.3).slice(0, 6)
      const beers = byBeer(gs, (r) => r.abvGap).sort((a, b) => a.avg - b.avg)
      const sign = (n: number) => (Math.abs(n) < 0.05 ? 'On target' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`)
      return (
        <>
          <Headline value={`${within} of ${gs.length}`} text="batches finished within 0.3% ABV of their target." note={`${ogs.length ? `${ogWithin} of ${ogs.length} hit their starting gravity within 0.3°P. ` : ''}Targets come from each batch's own brew sheet. ABV is worked out from the first and last gravity readings.`} />
          {off.length > 0 && <Block title="Furthest from target">{off.map((r) => <Bar key={r.item.id} label={tag(r)} sub={`${dp(r.item.abv)}% vs ${dp(r.item.target_abv)}%`} value={sign(r.abvGap!)} pct={(Math.abs(r.abvGap!) / 1.5) * 100} bg={r.abvGap! < 0 ? 'bg-water' : 'bg-malt'} />)}</Block>}
          {ogOff.length > 0 && <Block title="Starting gravity furthest from target">{ogOff.map((r) => <Bar key={r.item.id} label={tag(r)} sub={`${dp(r.item.og_plato)}°P vs ${dp(r.item.target_og_plato)}°P`} value={`${r.ogGap! > 0 ? '+' : ''}${r.ogGap!.toFixed(1)}°P`} pct={(Math.abs(r.ogGap!) / 2) * 100} bg={r.ogGap! < 0 ? 'bg-water' : 'bg-malt'} />)}</Block>}
          {beers.length > 0 && <Block title="ABV average by beer (2 or more batches)">{beers.map((b) => <Bar key={b.beer} label={b.beer} sub={`${b.n} batches`} value={sign(b.avg)} pct={(Math.abs(b.avg) / 1.5) * 100} bg={b.avg < 0 ? 'bg-water' : 'bg-malt'} />)}</Block>}
        </>
      )
    }

    const months = new Map<string, { l: number; n: number }>()
    let kegL = 0
    let canL = 0
    for (const r of rows) {
      const m = months.get(r.item.month) ?? { l: 0, n: 0 }
      months.set(r.item.month, { l: m.l + r.item.packed_l, n: m.n + 1 })
      const p = r.item.packed
      kegL += p.keg20 * 20 + p.keg30 * 30 + p.keg50 * 50
      canL += p.c24 * 9 + p.c16 * 7.04
    }
    const byMonth = [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
    const max = Math.max(...byMonth.map(([, m]) => m.l), 1)
    const total = byMonth.reduce((s, [, m]) => s + m.l, 0)
    const best = byMonth.reduce((a, b) => (b[1].l > a[1].l ? b : a))
    const kegShare = kegL + canL > 0 ? (kegL / (kegL + canL)) * 100 : null
    return (
      <>
        <Headline value={`${Math.round(total / byMonth.length).toLocaleString('en-AU')} L`} text={`packed in an average month. The biggest was ${monthShort(best[0])} at ${Math.round(best[1].l).toLocaleString('en-AU')} L.`} note={kegShare != null ? `${Math.round(kegShare)}% of it went into kegs, ${Math.round(100 - kegShare)}% into cans.` : undefined} />
        <Block title="Litres packed by month">{byMonth.map(([k, m]) => <Bar key={k} label={monthShort(k)} sub={`${m.n} batch${m.n === 1 ? '' : 'es'}`} value={`${Math.round(m.l).toLocaleString('en-AU')} L`} pct={(m.l / max) * 100} bg={yearBg(k)} />)}</Block>
      </>
    )
  }

  return (
    <section className="mb-5" aria-label="Insights">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className={`${CARD} w-full flex items-center gap-3 px-4 py-3 text-left active:opacity-90`}>
        <Lightbulb className="h-5 w-5 flex-shrink-0 text-malt" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Insights</p>
          <p className="text-xs text-gray-500">{enough ? `What ${rows.length} batches packed in ${range.label} add up to` : `Needs 3 or more batches. ${rows.length} packed in ${range.label}`}</p>
        </div>
        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`${CARD} mt-2.5 px-4 py-4`}>
          <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id}
                className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${view === v.id ? 'bg-primary text-white' : 'bg-black/5 text-gray-600'}`}>
                {v.label}
              </button>
            ))}
          </div>
          {enough ? body() : <p className="text-sm text-gray-500">Only {rows.length} batch{rows.length === 1 ? '' : 'es'} packed in {range.label}. Pick Calendar year or Financial year above for enough to compare.</p>}
        </div>
      )}
    </section>
  )
}
