import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardData } from '@/lib/dashboard'
import { getFrigidReadings, utilityReadings, FRIGID_OFF_SET_POINT } from '@/lib/frigid'
import { nextBrewsByTank } from '@/lib/planner/next-brews'
import { listEvents, adelaideNow, dayKey, addDaysKey } from '@/lib/planner/google'
import { stockForecast } from '@/lib/planner/forecast'
import { AutoRefresh } from '@/components/dashboard/AutoRefresh'
import { TempTap } from '@/components/tank/SetPoint'
import { calcAbv, formatUserName } from '@/lib/utils'
import { addDaysISO, daysBetweenISO } from '@/lib/dates'
import { stageStyle, brewStageStyle } from '@/lib/stage-style'
import { greeting, specialGreeting } from '@/lib/greeting'
import { Hello } from '@/components/layout/Hello'
import { KpiTiles } from './KpiTiles'
import type { Kpi } from './KpiTiles'
import { getBirthday } from '@/app/settings/actions'
import type { TankDashboardData } from '@/types'
import type { CalEvent } from '@/lib/planner/google'

export const dynamic = 'force-dynamic'

// ── Shared look ───────────────────────────────────────────────────────────────

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'


function Panel({ title, action, children, className = '' }: {
  title: string; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <section className={`${CARD} ${className}`}>
      <header className="flex items-baseline justify-between px-5 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/** A day the way you would say it: Today, Tomorrow, Yesterday, otherwise "Tue 13 Oct". */
const relDay = (key: string, today: string) =>
  key === today ? 'Today' : key === addDaysISO(today, 1) ? 'Tomorrow' : key === addDaysISO(today, -1) ? 'Yesterday' : fmtDay(key)

/** The Cellar page, opened on this tank's detail screen and ferment chart */
const tankHref = (tankId: string) => `/?tank=${tankId}`

const more = (href: string, label: string) => (
  <Link href={href} className="text-xs font-medium text-primary hover:underline">{label}</Link>
)

const fmtDay = (key: string) =>
  new Date(key + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

const litres = (n: number) => `${Math.round(n).toLocaleString('en-AU')} L`

// ── What needs a look ─────────────────────────────────────────────────────────

const READING_OVERDUE_DAYS = 3
const OFF_TARGET_C = 3

interface Flag { tank: string; text: string; tone: 'warn' | 'info' }

function buildFlags(tanks: TankDashboardData[], today: string, frigidUp: boolean): Flag[] {
  const flags: Flag[] = []
  if (!frigidUp) flags.push({ tank: 'Frigid', text: 'Not responding. Temperatures and set points are not shown.', tone: 'warn' })

  for (const t of tanks) {
    const { tank, brew } = t
    if (!brew) {
      const next = t.next_scheduled_brew
      if (next) {
        const inDays = daysBetweenISO(today, next.scheduled_date)
        if (inDays <= 1) flags.push({ tank: tank.name, text: `${next.recipe_name ?? 'Brew'} is booked ${inDays <= 0 ? 'today' : 'tomorrow'}.`, tone: 'info' })
      }
      continue
    }

    const fermenting = brew.stage === 'active_ferment' || brew.stage === 'diacetyl_rest'
    if (fermenting) {
      const last = t.latest_gravity?.recorded_at?.slice(0, 10)
      const days = last ? daysBetweenISO(last, today) : null
      if (days == null) flags.push({ tank: tank.name, text: `${brew.beer_name} has no gravity or pH logged yet.`, tone: 'warn' })
      else if (days >= READING_OVERDUE_DAYS) flags.push({ tank: tank.name, text: `${brew.beer_name}: no reading for ${days} days.`, tone: 'warn' })
    }

    const set = t.set_point_c
    if (t.temperature != null && set != null && set !== FRIGID_OFF_SET_POINT) {
      const gap = t.temperature - set
      if (Math.abs(gap) >= OFF_TARGET_C) {
        flags.push({
          tank: tank.name,
          text: `${t.temperature.toFixed(1)}°C against a ${set.toFixed(1)}°C set point${gap > 0 && brew.stage === 'on_chill' ? ' (still chilling)' : ''}.`,
          tone: gap > 0 && brew.stage === 'on_chill' ? 'info' : 'warn',
        })
      }
    }
  }
  return flags
}

// ── Stock: slow (several Google Sheets reads), so it streams in on its own ────

type Forecast = Awaited<ReturnType<typeof stockForecast>>
let stockCache: { at: number; data: Forecast } | null = null
const STOCK_CACHE_MS = 10 * 60 * 1000

/** The forecast, re-read at most every ten minutes. Falls back to the last good read if the sheet is down. */
async function cachedForecast(): Promise<{ data: Forecast | null; failed: string | null }> {
  if (stockCache && Date.now() - stockCache.at < STOCK_CACHE_MS) return { data: stockCache.data, failed: null }
  try {
    const data = await stockForecast(adelaideNow())
    stockCache = { at: Date.now(), data }
    return { data, failed: null }
  } catch (e) {
    return { data: stockCache?.data ?? null, failed: e instanceof Error ? e.message : 'Unknown error' }
  }
}

async function StockPanel() {
  const { data, failed } = await cachedForecast()

  if (!data) return <p className="px-5 pb-5 text-sm text-gray-500">Stock could not be read from the Sales App sheet. {failed}</p>

  // Only beers that are actually selling. Already out counts as zero cover and comes first.
  const rows = data.skus
    .filter((s) => s.per_week > 0 && (s.band === 'out' || s.weeks_cover != null))
    // A limited release that has sold through with no re-brew booked is finished, not a problem
    .filter((s) => !(s.band === 'out' && s.range === 'limited' && !s.next_pack))
    .sort((a, b) => (a.weeks_cover ?? 0) - (b.weeks_cover ?? 0))
    .slice(0, 7)

  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-gray-500">Nothing is selling fast enough to forecast a run-out.</p>

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-gray-400 text-left">
            <th className="font-normal px-5 py-1.5">Beer</th>
            <th className="font-normal px-2 py-1.5 text-right">On hand</th>
            <th className="font-normal px-2 py-1.5 text-right">Cover</th>
            <th className="font-normal px-2 py-1.5">Runs out</th>
            <th className="font-normal pl-2 pr-5 py-1.5">Next pack</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const out = s.band === 'out'
            const weeks = s.weeks_cover ?? 0
            // Dry before the next pack lands is the case that needs a decision
            const gap = out || (!!s.run_out_flat && (!s.next_pack || s.next_pack.date > s.run_out_flat))
            return (
              <tr key={s.sku} className="border-t border-gray-100">
                <td className="px-5 py-2">
                  <span className="font-medium text-gray-900">{s.beer}</span>
                  <span className="text-gray-400"> · {s.format}</span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-700">{s.available ?? '-'}</td>
                <td className={`px-2 py-2 text-right tabular-nums font-semibold ${weeks < 2 ? 'text-red-600' : weeks < 4 ? 'text-malt-dark' : 'text-gray-900'}`}>
                  {out ? 'Out' : `${weeks.toFixed(1)} wk`}
                </td>
                <td className="px-2 py-2 tabular-nums text-gray-700">{out ? 'Now' : s.run_out_flat ? fmtDay(s.run_out_flat) : '-'}</td>
                <td className={`pl-2 pr-5 py-2 tabular-nums ${gap ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
                  {s.next_pack ? fmtDay(s.next_pack.date) : 'None booked'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-[11px] text-gray-400 border-t border-gray-100">
        Shortest cover first, at the last 8 weeks&apos; sales rate. Keg dates are the latest possible: taproom pours that were
        never logged are not counted. Red in the last column means it runs dry before the next pack.
        {failed && ' Showing the last good read; the sheet could not be reached just now.'}
      </p>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const EVENT_DOT: [RegExp, string][] = [
  [/^\s*BREW/i, 'bg-malt'],
  [/^\s*PACK/i, 'bg-hops'],
  [/^\s*TRANSFER/i, 'bg-water'],
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = dayKey(adelaideNow())

  const [frigid, nextBrews, events, recentResult, utilityRows] = await Promise.all([
    getFrigidReadings(),
    nextBrewsByTank(),
    listEvents(today, addDaysKey(today, 13)).catch((): CalEvent[] | null => null),
    supabase
      .from('gravity_readings')
      .select('id, recorded_at, plato, ph, recorded_by, brews(beer_name, tanks(name))')
      .or('plato.not.is.null,ph.not.is.null')
      .order('recorded_at', { ascending: false })
      .limit(6),
    supabase.from('tanks').select('id, frigid_tank_name').eq('is_utility', true),
  ])
  const utilityIds = new Map((utilityRows.data ?? []).map((t) => [t.frigid_tank_name as string, t.id as string]))
  const tanks = await getDashboardData(supabase, frigid, nextBrews)

  const full = tanks.filter((t) => t.brew)
  const inTank = full.reduce((sum, t) => sum + (t.brew?.volume_l ?? 0), 0)
  const onChill = full.filter((t) => t.brew?.stage === 'on_chill')
  const flags = buildFlags(tanks, today, frigid.length > 0)
  const warnings = flags.filter((f) => f.tone === 'warn').length
  const utilities = utilityReadings(frigid)
  const nextBrew = (events ?? []).find((e) => /^\s*BREW/i.test(e.title))

  const { data: { user } } = await supabase.auth.getUser()
  const firstName = user?.email ? formatUserName(user.email) : ''
  const birthday = await getBirthday()
  const hello = greeting(firstName, { brewDay: !!nextBrew && nextBrew.date === today, birthday })

  const kpis: Kpi[] = [
    {
      label: 'Tanks in use', value: `${full.length} of ${tanks.length}`, sub: `${tanks.length - full.length} empty`,
      rowsTitle: 'Every tank',
      rows: tanks.map((t) => {
        const next = t.next_scheduled_brew
        return t.brew && t.brew.stage !== 'empty'
          ? {
              lead: t.tank.name, title: t.brew.beer_name,
              sub: [brewStageStyle(t.brew).label, t.brew.style].filter(Boolean).join(' · '),
              right: litres(t.brew.volume_l), rightSub: t.days_in_tank != null ? `day ${t.days_in_tank}` : '',
              href: tankHref(t.tank.id),
            }
          : {
              lead: t.tank.name, title: 'Empty',
              sub: next ? `Next: ${next.recipe_name ?? 'a brew'}, ${relDay(next.scheduled_date, today).replace(/^T/, 't')}` : 'Nothing booked',
              right: '', rightSub: '',
            }
      }),
    },
    {
      label: 'Beer in tank', value: litres(inTank), sub: `${full.length} batch${full.length === 1 ? '' : 'es'}`,
      rowsTitle: 'Beer in tank, biggest first',
      rows: [...full].sort((a, b) => (b.brew?.volume_l ?? 0) - (a.brew?.volume_l ?? 0)).map((t) => ({
        lead: t.tank.name, title: t.brew?.beer_name ?? '',
        sub: [t.brew ? brewStageStyle(t.brew).label : '', t.brew?.style].filter(Boolean).join(' · '),
        right: litres(t.brew?.volume_l ?? 0),
        rightSub: inTank > 0 ? `${Math.round(((t.brew?.volume_l ?? 0) / inTank) * 100)}% of the cellar` : '',
        href: tankHref(t.tank.id),
      })),
    },
    {
      label: 'On chill', value: String(onChill.length),
      sub: onChill.length ? litres(onChill.reduce((s, t) => s + (t.brew?.volume_l ?? 0), 0)) + ' to package' : 'Nothing waiting',
      rowsTitle: 'On chill',
      rows: onChill.map((t) => {
        const abv = t.brew?.og_plato != null && t.latest_gravity?.plato != null ? calcAbv(t.brew.og_plato, t.latest_gravity.plato) : null
        const set = t.set_point_c != null && t.set_point_c !== FRIGID_OFF_SET_POINT ? `Set to ${t.set_point_c.toFixed(1)}°` : 'No set point'
        return {
          lead: t.tank.name,
          title: t.brew?.beer_name ?? '',
          sub: [t.brew?.style, litres(t.brew?.volume_l ?? 0), abv != null ? `${abv.toFixed(1)}%` : '', t.days_in_tank != null ? `day ${t.days_in_tank}` : ''].filter(Boolean).join(' · '),
          right: t.temperature != null ? `${t.temperature.toFixed(1)}°C` : '-',
          rightSub: set,
          href: tankHref(t.tank.id),
        }
      }),
    },
    {
      label: 'Next brew', value: nextBrew ? relDay(nextBrew.date, today) : 'None booked', sub: nextBrew ? nextBrew.title.replace(/^\s*BREW\s*/i, '') : 'in the next two weeks',
      rowsTitle: 'Brews in the next two weeks',
      rows: (events ?? []).filter((e) => /^\s*BREW/i.test(e.title)).map((e) => ({
        lead: new Date(e.date + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        title: e.title.replace(/^\s*BREW\s*/i, '').replace(/^[\s:\-]+/, ''),
        sub: relDay(e.date, today) === fmtDay(e.date) ? new Date(e.date + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' }) : relDay(e.date, today),
        right: '', rightSub: '',
        href: '/planner',
      })),
    },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recent = ((recentResult.data ?? []) as any[]).map((r) => {
    const brew = Array.isArray(r.brews) ? r.brews[0] : r.brews
    const tank = Array.isArray(brew?.tanks) ? brew.tanks[0] : brew?.tanks
    return { id: r.id as string, at: r.recorded_at as string, plato: r.plato as number | null, ph: r.ph as number | null, by: r.recorded_by as string, beer: (brew?.beer_name ?? '-') as string, tank: (tank?.name ?? '-') as string }
  })

  // Calendar, grouped by day
  const byDay = new Map<string, CalEvent[]>()
  for (const e of events ?? []) {
    const day = e.date < today ? today : e.date
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(e)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AutoRefresh seconds={60} />
      <div className="px-4 md:px-6 py-5 max-w-[1500px] mx-auto space-y-4">
        {/* Same greeting line as the Cellar page */}
        <h1 className="px-1 md:px-0 text-lg font-semibold md:text-2xl md:font-bold tracking-tight text-gray-900">
          <Hello text={hello} name={firstName} special={!!specialGreeting(firstName, { birthday })} />
        </h1>

        {/* Headline numbers */}
        <KpiTiles kpis={kpis} />

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
          {/* Tanks */}
          <Panel title="Tanks" action={more('/', 'Open cellar')} className="xl:col-span-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-400 text-left">
                    <th className="font-normal sticky left-0 z-10 bg-white pl-4 pr-3 md:px-5 py-1.5">Tank</th>
                    <th className="font-normal px-2 py-1.5">Beer</th>
                    <th className="font-normal px-2 py-1.5">Stage</th>
                    <th className="font-normal px-2 py-1.5 text-right">Day</th>
                    <th className="font-normal px-2 py-1.5 text-right">Gravity</th>
                    <th className="font-normal px-2 py-1.5 text-right">pH</th>
                    <th className="font-normal px-2 py-1.5 text-right">ABV</th>
                    <th className="font-normal px-2 py-1.5 text-right">Temp</th>
                    <th className="font-normal px-2 py-1.5 text-right">Set</th>
                    <th className="font-normal pl-2 pr-5 py-1.5 text-right">Last reading</th>
                  </tr>
                </thead>
                <tbody>
                  {tanks.map((t) => {
                    const { tank, brew } = t
                    const stage = brew ? brewStageStyle(brew) : null
                    const abv = brew?.og_plato != null && t.latest_gravity?.plato != null ? calcAbv(brew.og_plato, t.latest_gravity.plato) : null
                    const lastDay = t.latest_gravity?.recorded_at?.slice(0, 10)
                    const since = lastDay ? daysBetweenISO(lastDay, today) : null
                    const cooling = t.set_point_c != null && t.set_point_c !== FRIGID_OFF_SET_POINT
                    const late = !!brew && (brew.stage === 'active_ferment' || brew.stage === 'diacetyl_rest') && (since == null || since >= READING_OVERDUE_DAYS)
                    return (
                      <tr key={tank.id} className="border-t border-gray-100">
                        {/* Stays put while the rest scrolls sideways on a phone */}
                        <td className="sticky left-0 z-10 bg-white pl-4 pr-3 md:px-5 py-2 font-semibold tabular-nums text-gray-900 whitespace-nowrap shadow-[6px_0_6px_-6px_rgba(16,24,40,0.12)] md:shadow-none">
                          {brew ? <Link href={tankHref(tank.id)} className="underline decoration-dotted decoration-black/25 underline-offset-4">{tank.name}</Link> : tank.name}
                        </td>
                        {brew ? (
                          <>
                            <td className="px-2 py-2 max-w-[16rem]">
                              <p className="font-medium text-gray-900 truncate">{brew.beer_name}</p>
                              <p className="text-xs text-gray-400 truncate">{[brew.style, litres(brew.volume_l)].filter(Boolean).join(' · ')}</p>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-0.5 text-xs font-medium ${stage?.pill ?? 'bg-gray-100 text-gray-600'}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${stage?.dot ?? 'bg-gray-400'}`} />
                                {stage?.label ?? brew.stage}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-700">{t.days_in_tank ?? '-'}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-900">{t.latest_gravity?.plato != null ? `${t.latest_gravity.plato}°P` : '-'}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-900">{t.latest_gravity?.ph ?? '-'}</td>
                            <td className="px-2 py-2 text-right tabular-nums text-gray-900">{abv != null ? `${abv.toFixed(1)}%` : '-'}</td>
                          </>
                        ) : (
                          <td colSpan={6} className="px-2 py-2 text-gray-400">
                            Empty{t.next_scheduled_brew ? <span className="text-gray-500"> · next: {t.next_scheduled_brew.recipe_name}, {relDay(t.next_scheduled_brew.scheduled_date, today).replace(/^T/, 't')}</span> : ''}
                          </td>
                        )}
                        <td className="px-2 py-2 text-right tabular-nums text-gray-900">
                          <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={t.temperature} setPoint={t.set_point_c}>
                            {t.temperature != null ? `${t.temperature.toFixed(1)}°` : '-'}
                          </TempTap>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-500">
                          <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={t.temperature} setPoint={t.set_point_c}>
                            {cooling ? `${t.set_point_c!.toFixed(1)}°` : 'Off'}
                          </TempTap>
                        </td>
                        <td className={`pl-2 pr-5 py-2 text-right tabular-nums whitespace-nowrap ${late ? 'text-malt-dark font-medium' : 'text-gray-500'}`}>
                          {!brew ? '' : since == null ? 'None' : since === 0 ? 'Today' : since === 1 ? 'Yesterday' : `${since} days ago`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Right rail */}
          <div className="space-y-4">
            <Panel title="Needs a look" action={<span className="text-xs text-gray-400">{warnings ? `${warnings} to action` : 'All clear'}</span>}>
              {flags.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-gray-500">Nothing is overdue or off target.</p>
              ) : (
                <ul className="pb-2">
                  {flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-2 border-t border-gray-100 text-sm">
                      <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${f.tone === 'warn' ? 'bg-malt' : 'bg-gray-300'}`} />
                      <p className="text-gray-700"><span className="font-semibold text-gray-900">{f.tank}</span> {f.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Hot, cold and glycol">
              {utilities.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-gray-500">No reading from Frigid.</p>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
                  {utilities.map((u) => (
                    <div key={u.name} className="px-4 py-3">
                      <p className="text-xs text-gray-500">{u.name}</p>
                      <p className="text-xl font-semibold tabular-nums text-gray-900">
                        <TempTap tankId={utilityIds.get(u.name)} name={u.name} temperature={u.temperature} setPoint={u.setPoint}>
                          {u.temperature != null ? `${u.temperature.toFixed(1)}°` : '-'}
                        </TempTap>
                      </p>
                      <p className="text-xs text-gray-400 tabular-nums">{u.setPoint != null && u.setPoint !== FRIGID_OFF_SET_POINT ? `Set ${u.setPoint.toFixed(1)}°` : 'No set point'}</p>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Latest readings">
              {recent.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-gray-500">Nothing logged yet.</p>
              ) : (
                <ul className="pb-2">
                  {recent.map((r) => (
                    <li key={r.id} className="flex items-baseline gap-3 px-5 py-2 border-t border-gray-100 text-sm">
                      <span className="w-10 flex-shrink-0 font-semibold tabular-nums text-gray-900">{r.tank}</span>
                      <span className="flex-1 min-w-0 truncate text-gray-700">
                        {r.plato != null ? `${r.plato}°P` : ''}{r.plato != null && r.ph != null ? ' · ' : ''}{r.ph != null ? `pH ${r.ph}` : ''}
                        <span className="text-gray-400"> · {r.beer}</span>
                      </span>
                      <span className="flex-shrink-0 text-xs text-gray-400 whitespace-nowrap">
                        {relDay(dayKeyOf(r.at), today)} · {formatUserName(r.by)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Panel title="Next two weeks" action={more('/planner', 'Open calendar')}>
            {events == null ? (
              <p className="px-5 pb-5 text-sm text-gray-500">The Brewery Schedule calendar could not be read.</p>
            ) : byDay.size === 0 ? (
              <p className="px-5 pb-5 text-sm text-gray-500">Nothing on the Brewery Schedule.</p>
            ) : (
              <ul className="pb-2">
                {[...byDay.entries()].map(([day, list]) => (
                  <li key={day} className="flex gap-4 px-5 py-2 border-t border-gray-100 text-sm">
                    <span className={`w-24 flex-shrink-0 tabular-nums ${day === today ? 'font-semibold text-primary' : 'text-gray-500'}`}>
                      {relDay(day, today)}
                    </span>
                    <span className="flex-1 min-w-0 space-y-0.5">
                      {list.map((e) => (
                        <span key={e.id} className="flex items-center gap-2 text-gray-800">
                          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${EVENT_DOT.find(([re]) => re.test(e.title))?.[1] ?? 'bg-gray-300'}`} />
                          <span className="truncate">{e.time ? `${e.time} ` : ''}{e.title}</span>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Stock running low" action={more('/planner', 'Ask the planner')}>
            <Suspense fallback={<p className="px-5 pb-5 text-sm text-gray-400">Reading the Sales App sheet…</p>}>
              <StockPanel />
            </Suspense>
          </Panel>
        </div>
      </div>
    </main>
  )
}

/** Brewery-local calendar day of a timestamp. */
function dayKeyOf(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Adelaide' }).format(new Date(iso))
}
