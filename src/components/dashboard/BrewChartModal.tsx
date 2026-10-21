'use client'

import { logDayTime } from '@/lib/log-date'
import { PackPlanSummary } from '@/components/tank/PackPlan'
import type { SheetSplit } from '@/lib/tank-splits'
import { useState, useEffect, useMemo } from 'react'
import { X, FlaskConical, Trash2, MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SheetAction, StageOption } from '@/components/tank/TankDetailSheet'
import { toast } from 'sonner'
import { deleteReading } from '@/app/readings/actions'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
  LineChart,
} from 'recharts'
import { FRIGID_OFF_SET_POINT } from '@/lib/frigid'
import { format, parseISO } from 'date-fns'
import { getBrewChartData } from '@/app/brews/actions'
import { calcAbv, formatUserName } from '@/lib/utils'
import { VDK_STYLE, withVdk } from '@/lib/vdk'
import type { Brew, Tank } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  days_in_tank: number | null
  /** Opens the volume dialog. Without it the volume is shown but cannot be changed. */
  onVolume?: () => void
  /** The Splits sheet plan. A brite, or a beer transferred into an FV, shows it first: packing is what is next. */
  split?: SheetSplit | null
  /** The beer has been transferred into this tank, so it is being used as a brite */
  transferred?: boolean
  /** The tank card's own menu, so anything it can do can be done from here too */
  stages?: StageOption[]
  onStage?: (stage: StageOption['stage']) => void
  onLog?: () => void
  more?: SheetAction[]
  onClose: () => void
}

export type ChartData = Awaited<ReturnType<typeof getBrewChartData>>

interface ChartPoint {
  ts: number
  label: string
  plato: number | null
  ph: number | null
  temp: number | null
  /** Frigid's set point, null while cooling is off */
  set: number | null
}

// Frigid reports to three decimals; one is all a brewer reads
const oneDp = (n: number) => Math.round(n * 10) / 10

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const UNITS: Record<string, (v: number) => string> = {
  temp: (v) => `${v.toFixed(1)}°C`,
  set: (v) => `${v.toFixed(1)}°C`,
  plato: (v) => `${v}°P`,
  ph: (v) => `${v}`,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium text-gray-600 mb-1">{typeof label === 'number' ? format(new Date(label), 'EEE d MMM, HH:mm') : label}</p>
      {payload.map((p: { color: string; name: string; dataKey: string; value: number | null }) =>
        p.value != null ? (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: <span className="font-semibold tabular-nums">{UNITS[p.dataKey]?.(p.value) ?? p.value}</span>
          </p>
        ) : null
      )}
    </div>
  )
}

/** Chart ranges, as on the Frigid app. Each runs back from the latest reading. */
type RangeKey = '24h' | '3d' | '7d' | 'all'
const RANGES: { key: RangeKey; label: string; ms: number }[] = [
  { key: '24h', label: '24 hrs', ms: DAY },
  { key: '3d', label: '3 days', ms: 3 * DAY },
  { key: '7d', label: '7 days', ms: 7 * DAY },
  { key: 'all', label: 'All', ms: Infinity },
]
const RANGE_KEY = 'ferment-chart-range'
function loadRange(): RangeKey {
  if (typeof window === 'undefined') return 'all'
  try {
    const r = localStorage.getItem(RANGE_KEY)
    return RANGES.some((x) => x.key === r) ? (r as RangeKey) : 'all'
  } catch { return 'all' }
}

/**
 * Time ticks on whole local hours or days, at the smallest step that fits up to
 * seven across a phone, so the axis reads 20:00, 00:00, 04:00 rather than odd minutes.
 */
const TICK_STEPS = [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY]
function timeTicks(start: number, end: number) {
  const step = TICK_STEPS.find((s) => (end - start) / s <= 7) ?? 28 * DAY
  const d = new Date(start)
  d.setMinutes(0, 0, 0)
  if (step >= DAY) d.setHours(0)
  else d.setHours(Math.floor(d.getHours() / (step / HOUR)) * (step / HOUR))
  const ticks: number[] = []
  // Stepping by date rather than by milliseconds keeps ticks on midnight across a daylight saving change
  while (d.getTime() <= end) {
    if (d.getTime() >= start) ticks.push(d.getTime())
    if (step >= DAY) d.setDate(d.getDate() + step / DAY)
    else d.setHours(d.getHours() + step / HOUR)
  }
  return { ticks, step }
}

/** A temperature axis tight on the line, in 0.5° steps when the swing is small, so a 3° rise reads as one */
function tempAxis(vals: number[]) {
  if (!vals.length) return { domain: [0, 30] as [number, number], ticks: undefined }
  const lo = Math.min(...vals), hi = Math.max(...vals)
  const swing = hi - lo
  const step = swing <= 4 ? 0.5 : swing <= 10 ? 1 : 2
  const min = Math.floor((lo - step / 2) / step) * step
  const max = Math.ceil((hi + step / 2) / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10)
  return { domain: [min, max] as [number, number], ticks }
}

/**
 * The name of a stage change, written down the left of its marker line from the top
 * of the plot. Recharts' own rotated label hangs above the plot and gets clipped.
 */
function StageLabel({ viewBox, text }: { viewBox?: { x: number; y: number }; text: string }) {
  if (!viewBox || !text) return null
  const x = viewBox.x - 3
  const y = viewBox.y + 4
  return (
    <text x={x} y={y} transform={`rotate(-90 ${x} ${y})`} textAnchor="end" fontSize={9} fill="var(--chart-muted)">
      {text}
    </text>
  )
}

function mergeChartData(
  readings: ChartData['readings'],
  temps: ChartData['temps'],
  bucket: number
): ChartPoint[] {
  const map = new Map<number, ChartPoint>()

  // Tank temperatures arrive every ten minutes. A short range shows every one; a
  // long one keeps one per bucket so the line stays smooth and the phone stays quick.
  for (const t of temps) {
    const at = new Date(t.recorded_at).getTime()
    const ts = Math.floor(at / bucket) * bucket
    if (map.has(ts)) continue
    const set = t.set_point_c != null && t.set_point_c !== FRIGID_OFF_SET_POINT ? oneDp(Number(t.set_point_c)) : null
    map.set(ts, {
      ts,
      label: format(parseISO(t.recorded_at), 'd MMM HH:mm'),
      plato: null,
      ph: null,
      temp: oneDp(Number(t.temperature_c)),
      set,
    })
  }

  for (const r of readings) {
    const ts = new Date(r.recorded_at).getTime()
    const existing = map.get(ts)
    map.set(ts, {
      ts,
      label: format(parseISO(r.recorded_at), 'd MMM HH:mm'),
      plato: r.plato ?? null,
      ph: r.ph ?? null,
      temp: r.temperature_c != null ? oneDp(Number(r.temperature_c)) : existing?.temp ?? null,
      set: existing?.set ?? null,
    })
  }

  return [...map.values()].sort((a, b) => a.ts - b.ts)
}

/** Loads a brew's readings and tank temperatures once, for the chart and the readings list. */
// `refreshKey` changes when something new has been logged, so an open screen picks it up.
export function useBrewChart(brew: Brew, tank: Tank, refreshKey = '') {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    let live = true
    getBrewChartData(brew.id, tank.id, brew.brew_day)
      .then((d) => { if (live) setData(d) })
      .catch(() => { /* chart stays empty; the rest of the screen still works */ })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [brew.id, tank.id, brew.brew_day, refreshKey, reloads])

  // James only: take a reading off. It goes from the list straight away and
  // comes back if the delete does not go through.
  const remove = (id: string, label: string) => {
    if (!confirm(`Delete the reading from ${label}? This cannot be undone.`)) return
    setData((d) => (d ? { ...d, readings: d.readings.filter((r) => r.id !== id) } : d))
    deleteReading(id).catch(() => {
      toast.error('Could not delete that reading. It has been put back.')
      setReloads((n) => n + 1)
    })
  }

  return { data, loading, remove }
}

/** The bin button on a reading, for James only */
export function DeleteReading({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Delete reading"
      className="flex-shrink-0 -my-1 h-8 w-8 inline-flex items-center justify-center rounded-full text-gray-300 hover:text-malt-dark active:bg-gray-100">
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

type SeriesKey = 'plato' | 'ph' | 'temp' | 'set'
const SERIES: { key: SeriesKey; label: string; colour: string }[] = [
  { key: 'plato', label: 'Gravity', colour: 'var(--chart-gravity)' },
  { key: 'ph', label: 'pH', colour: 'var(--chart-ph)' },
  { key: 'temp', label: 'Temp', colour: 'var(--chart-temp)' },
  { key: 'set', label: 'Target', colour: 'var(--chart-muted)' },
]
// Which lines are drawn is a personal choice, remembered on the device
const SHOWN_KEY = 'ferment-chart-lines'
function loadShown(): Record<SeriesKey, boolean> {
  const all = { plato: true, ph: true, temp: true, set: true }
  if (typeof window === 'undefined') return all
  try { return { ...all, ...(JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '{}') as Partial<Record<SeriesKey, boolean>>) } } catch { return all }
}

/**
 * Gravity, pH and temperature over the life of a brew. Each line can be
 * switched off. A transferred beer starts at the transfer, with the whole
 * brew (fermenter included) one tap away. The range buttons and the slider
 * under the chart narrow it down to hours, as on the Frigid app.
 */
export function FermentChart({ brew, data: all, loading, height = 280 }: {
  brew: Brew
  data: ChartData | null
  loading: boolean
  height?: number
}) {
  const [whole, setWhole] = useState(false)
  const [range, setRange] = useState<RangeKey>(loadRange)
  // The slider's window, as indexes into the points. Null is the whole range.
  const [zoom, setZoomState] = useState<{ startIndex: number; endIndex: number } | null>(null)
  // Bumped to put the slider back to full width; a drag must not remount it
  const [brushKey, setBrushKey] = useState(0)
  const setZoom = (z: typeof zoom) => {
    setZoomState(z)
    if (!z) setBrushKey((n) => n + 1)
  }
  const pickRange = (r: RangeKey) => {
    setRange(r)
    setZoom(null)
    try { localStorage.setItem(RANGE_KEY, r) } catch { /* private mode: it still works for this visit */ }
  }

  const since = all?.transferredAt && !whole ? all.transferredAt : null
  // Built once per range, not on every render. Recharts snaps the slider back to the
  // end whenever it is handed a new data array, so rebuilding it on each drag undid the drag.
  const { fromIso, data, chartData } = useMemo(() => {
    // A range runs back from the latest thing on the chart, so a finished brew in History still shows its last days
    const latest = all
      ? Math.max(0, ...all.temps.map((t) => new Date(t.recorded_at).getTime()), ...all.readings.map((r) => new Date(r.recorded_at).getTime()))
      : 0
    const rangeMs = RANGES.find((r) => r.key === range)!.ms
    const fromIso = [since, Number.isFinite(rangeMs) && latest ? new Date(latest - rangeMs).toISOString() : null]
      .filter((x): x is string => !!x).sort().at(-1) ?? null
    const data = all && fromIso
      ? { ...all, readings: all.readings.filter((r) => r.recorded_at >= fromIso), temps: all.temps.filter((t) => t.recorded_at >= fromIso) }
      : all

    // Every ten-minute reading up to three days; beyond that about 500 points across the range
    const tempSpan = data?.temps.length ? new Date(data.temps.at(-1)!.recorded_at).getTime() - new Date(data.temps[0].recorded_at).getTime() : 0
    const bucket = Math.max(10 * MIN, Math.ceil(tempSpan / 500 / (10 * MIN)) * 10 * MIN)
    return { fromIso, data, chartData: data ? mergeChartData(data.readings, data.temps, bucket) : [] }
  }, [all, since, range])
  const readings = data?.readings ?? []
  const stageEvents = readings.filter((r) => r.plato == null && r.ph == null && r.notes?.startsWith('→'))
  const gravityReadings = readings.filter((r) => r.plato != null || r.ph != null)
  const visible = zoom ? chartData.slice(zoom.startIndex, zoom.endIndex + 1) : chartData

  const platoVals = readings.map((r) => r.plato).filter((v): v is number => v != null)
  const platoMin = platoVals.length ? Math.min(...platoVals) : 0
  // Since a transfer, or over a short range, the gravity has stopped moving: scale to the readings, not the OG
  const platoMax = (fromIso ? null : brew.og_plato) ?? (platoVals.length ? Math.max(...platoVals) : 20)
  const platoPad = Math.max((platoMax - platoMin) * 0.2, 1)

  const [show, setShow] = useState<Record<SeriesKey, boolean>>(loadShown)
  const flip = (k: SeriesKey) => setShow((s) => {
    const next = { ...s, [k]: !s[k] }
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify(next)) } catch { /* private mode: it still works for this visit */ }
    return next
  })

  const hasTemp = chartData.some((p) => p.temp != null)
  const hasSet = chartData.some((p) => p.set != null)
  const showTemp = hasTemp && show.temp
  const showSet = hasSet && show.set
  // The axis fits what is on screen, so zooming in on a dip gives it the full height
  const visTemps = visible.map((p) => p.temp).filter((v): v is number => v != null)
  const tAxis = tempAxis([
    ...(showTemp ? visTemps : []),
    ...(showSet ? visible.map((p) => p.set).filter((v): v is number => v != null) : []),
  ])
  const tempOnAxis = showTemp || showSet

  const start = visible[0]?.ts ?? 0
  const end = visible.at(-1)?.ts ?? 0
  const { ticks: xTicks, step: xStep } = timeTicks(start, end)
  // Ticks within a day read as clock times, with the date on the midnight tick
  const xLabel = (t: number) => {
    const d = new Date(t)
    if (xStep >= DAY) return format(d, 'd MMM')
    return d.getHours() === 0 ? format(d, 'd MMM') : format(d, 'HH:mm')
  }

  const hasReadings = gravityReadings.length > 0 || stageEvents.length > 0
  const nothing = !hasReadings && !hasTemp
  const lo = visTemps.length ? Math.min(...visTemps) : null
  const hi = visTemps.length ? Math.max(...visTemps) : null
  const now = visTemps.at(-1) ?? null

  return (
    <>
    {!loading && all && (all.temps.length > 0 || all.readings.length > 0) && (
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div role="group" aria-label="Time range" className="inline-flex h-8 rounded-full border border-gray-200 p-0.5">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => pickRange(r.key)} aria-pressed={range === r.key}
              className={`px-3 rounded-full text-xs font-semibold whitespace-nowrap ${range === r.key ? 'bg-primary text-white' : 'text-gray-500'}`}>
              {r.label}
            </button>
          ))}
        </div>
        {zoom && (
          <button type="button" onClick={() => setZoom(null)}
            className="h-8 px-3 rounded-full border border-gray-200 text-xs font-semibold text-gray-500">
            Reset zoom
          </button>
        )}
      </div>
    )}
    {!loading && lo != null && hi != null && (
      <p className="text-xs text-gray-500 tabular-nums pb-1">
        {format(new Date(start), 'd MMM HH:mm')} to {format(new Date(end), 'd MMM HH:mm')}
        {' · '}Low <span className="font-semibold text-gray-700">{lo.toFixed(1)}°</span>
        {' · '}High <span className="font-semibold text-gray-700">{hi.toFixed(1)}°</span>
        {now != null && <>{' · '}Latest <span className="font-semibold" style={{ color: 'var(--chart-temp)' }}>{now.toFixed(1)}°</span></>}
      </p>
    )}
    {loading ? (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    ) : nothing ? (
      <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-400">
        <FlaskConical className="h-8 w-8 text-gray-200" />
        <p className="text-sm">{all && (all.temps.length || all.readings.length) ? 'Nothing logged in this range.' : 'No readings logged yet.'}</p>
        <p className="text-xs">Use the Log button on the tank card to add readings.</p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={height + (chartData.length > 2 ? 48 : 0)}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          {/* A true time axis: a day is the same width wherever it falls. Spacing the points
              evenly instead gave two days of ten-minute tank temperatures most of the chart
              and squeezed five weeks of gravity readings into the left edge. */}
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={xTicks}
            tickFormatter={(t) => xLabel(Number(t))}
            tick={{ fontSize: 10, fill: 'var(--chart-muted)' }}
            tickLine={{ stroke: 'var(--chart-grid)' }}
            axisLine={false}
            interval={0}
          />

          {/* Left: Gravity °P */}
          <YAxis
            yAxisId="plato"
            orientation="left"
            // Whole-number bounds and one fixed decimal, so a tick reads 12.8 and never 12.799999
            domain={[Math.max(0, Math.floor(platoMin - platoPad)), Math.ceil(platoMax + platoPad)]}
            tick={{ fontSize: 10, fill: 'var(--chart-gravity)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${Number(v).toFixed(1)}°P`}
            // No gravity on screen: the temperature gets the room
            hide={!show.plato || platoVals.length === 0}
            width={show.plato && platoVals.length ? 46 : 0}
          />

          {/* Right: Temperature °C, in half degrees when the swing is small */}
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={tAxis.domain}
            ticks={tAxis.ticks}
            interval={0}
            allowDataOverflow
            tick={{ fontSize: 10, fill: 'var(--chart-temp)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${Number(v).toFixed(1)}°C`}
            // With temperature switched off the axis goes too, and the chart takes the room
            hide={!tempOnAxis}
            width={tempOnAxis ? 44 : 0}
          />

          {/* pH axis: hidden, domain [3,6] keeps the line in a sensible position. Width 0 because a
              hidden axis still pushes the temperature axis outwards by its width, off the edge. */}
          <YAxis yAxisId="ph" orientation="right" domain={[3, 6]} hide width={0} />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--chart-muted)', strokeDasharray: '3 3' }} />

          {/* OG reference */}
          {brew.og_plato != null && !fromIso && (
            <ReferenceLine
              yAxisId="plato"
              y={brew.og_plato}
              stroke="var(--chart-muted)"
              strokeDasharray="4 4"
              label={{ value: 'OG', fontSize: 9, fill: 'var(--chart-muted)', position: 'insideTopRight' }}
            />
          )}

          {/* Stage change markers */}
          {stageEvents.map((e) => (
            <ReferenceLine
              key={e.id}
              yAxisId="plato"
              x={new Date(e.recorded_at).getTime()}
              stroke="var(--chart-muted)"
              strokeDasharray="3 3"
              label={<StageLabel text={(e.notes ?? '').replace(/^→\s*/, '')} />}
            />
          ))}

          {/* Target temperature: steps, because a set point changes at a moment, not gradually */}
          {showSet && (
            <Line
              yAxisId="temp"
              type="stepAfter"
              dataKey="set"
              name="Target"
              stroke="var(--chart-muted)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          )}

          {/* Temperature line */}
          {showTemp && (
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              name="Temp"
              stroke="var(--chart-temp)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          )}

          {/* Gravity line */}
          {show.plato && <Line
            yAxisId="plato"
            type="monotone"
            dataKey="plato"
            name="Gravity"
            stroke="var(--chart-gravity)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--chart-gravity)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />}

          {/* pH line */}
          {show.ph && <Line
            yAxisId="ph"
            type="monotone"
            dataKey="ph"
            name="pH"
            stroke="var(--chart-ph)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--chart-ph)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />}

          {/* Zoom: drag the handles to close in on part of the range. Keyed so a new range starts unzoomed. */}
          {chartData.length > 2 && (
            <Brush
              key={brushKey}
              dataKey="ts"
              height={36}
              travellerWidth={18}
              stroke="var(--chart-muted)"
              fill="transparent"
              tickFormatter={() => ''}
              onChange={(r) => {
                const { startIndex, endIndex } = r as { startIndex?: number; endIndex?: number }
                if (startIndex == null || endIndex == null) return
                setZoomState(startIndex === 0 && endIndex === chartData.length - 1 ? null : { startIndex, endIndex })
              }}
            >
              <LineChart data={chartData}>
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <Line dataKey="temp" stroke="var(--chart-temp)" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </Brush>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    )}
    {!loading && (hasReadings || hasTemp || all?.transferredAt) && (
      <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 pb-1">
        {all?.transferredAt && (
          <div role="group" aria-label="Chart range" className="inline-flex h-8 rounded-full border border-gray-200 p-0.5 mr-1">
            {[
              { on: !whole, label: `Since transfer ${format(new Date(all.transferredAt), 'd MMM')}`, pick: () => { setWhole(false); setZoom(null) } },
              { on: whole, label: 'Whole brew', pick: () => { setWhole(true); setZoom(null) } },
            ].map((o) => (
              <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on}
                className={`px-3 rounded-full text-xs font-semibold whitespace-nowrap ${o.on ? 'bg-primary text-white' : 'text-gray-500'}`}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {SERIES.filter((s) => (s.key !== 'temp' || hasTemp) && (s.key !== 'set' || hasSet)).map((s) => (
          <button key={s.key} type="button" onClick={() => flip(s.key)} aria-pressed={show[s.key]}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium ${show[s.key] ? 'bg-white border-gray-200 text-gray-700' : 'bg-transparent border-gray-200 text-gray-400 line-through'}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: show[s.key] ? s.colour : 'transparent', boxShadow: `inset 0 0 0 1.5px ${s.colour}` }} />
            {s.label}
          </button>
        ))}
      </div>
    )}
    </>
  )
}

export function BrewChartModal({ brew, tank, days_in_tank, onVolume, split, transferred = false, stages, onStage, onLog, more, onClose }: Props) {
  const { data, loading, remove } = useBrewChart(brew, tank)
  const canDelete = !!data?.canDelete

  const readings = data?.readings ?? []
  const gravityReadings = readings.filter((r) => r.plato != null || r.ph != null)

  const latestPlato = gravityReadings.filter((r) => r.plato != null).at(-1)?.plato ?? null
  const attenuation =
    brew.og_plato && latestPlato != null
      ? Math.round(((brew.og_plato - latestPlato) / brew.og_plato) * 100)
      : null

  const abv =
    brew.og_plato != null && latestPlato != null
      ? calcAbv(brew.og_plato, latestPlato)
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{brew.beer_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tank.name}
              {brew.style ? ` · ${brew.style}` : ''}
              {days_in_tank != null ? ` · Day ${days_in_tank}` : ''}
              {' · '}
              {onVolume
                ? <button type="button" onClick={onVolume} aria-label="Change volume" className="rounded underline decoration-dotted decoration-black/25 underline-offset-4 hover:text-gray-700">{Math.round(brew.volume_l).toLocaleString('en-AU')} L</button>
                : `${Math.round(brew.volume_l).toLocaleString('en-AU')} L`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {more && (
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Tank actions" className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-50 hover:text-gray-600 cursor-pointer">
                  <MoreHorizontal className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-sm">
                  {stages && onStage && stages.map((st) => (
                    <DropdownMenuItem key={st.stage} disabled={!!st.blocked} onClick={() => !st.blocked && onStage(st.stage)}>
                      → {st.label}{st.blocked && <span className="ml-1.5 text-[10px] text-gray-400">{st.blocked}</span>}
                    </DropdownMenuItem>
                  ))}
                  {stages && onStage && <DropdownMenuSeparator />}
                  {onLog && <DropdownMenuItem onClick={onLog}>Log Reading…</DropdownMenuItem>}
                  {more.map((a) => (
                    <DropdownMenuItem key={a.label} className={a.danger ? 'text-red-600 focus:text-red-600' : undefined} onClick={a.onSelect}>{a.label}…</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {(tank.type === 'brite' || transferred) && (
          <div className="px-5 pt-4">
            <PackPlanSummary brew={brew} tank={tank.name} split={split} plato={latestPlato} abvNow={abv} />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-5 divide-x divide-gray-100 border-b border-gray-100">
          {[
            { label: 'OG', value: brew.og_plato != null ? `${brew.og_plato}°P` : '—', colour: '' },
            { label: 'Current', value: latestPlato != null ? `${latestPlato}°P` : '—', colour: '' },
            { label: 'ABV', value: abv != null ? `${abv.toFixed(1)}%` : '—', colour: abv != null ? 'text-hops' : '' },
            { label: 'Attenuation', value: attenuation != null ? `${attenuation}%` : '—', colour: '' },
            { label: 'Readings', value: gravityReadings.length, colour: '' },
          ].map(({ label, value, colour }) => (
            <div key={label} className="px-3 py-3 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className={`text-sm font-semibold tabular-nums mt-0.5 ${colour || 'text-gray-800'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="px-4 pt-4 pb-2">
          <FermentChart brew={brew} data={data} loading={loading} />
        </div>

        {/* Readings + stage events table */}
        {(readings.length > 0 || (data?.vdk.length ?? 0) > 0) && (
          <div className="px-5 pb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Readings</p>
            <div className="overflow-auto max-h-36 rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-400">Date</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-400">Gravity</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-400">pH</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-400">By</th>
                    {canDelete && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {withVdk(readings, data?.vdk).reverse().map((r) => {
                    if (r.vdk) {
                      return (
                        <tr key={r.id} className="border-t border-gray-50">
                          <td className="px-3 py-1.5 text-gray-500">{logDayTime(r.recorded_at, ', ')}</td>
                          <td colSpan={2} className="px-3 py-1.5 text-center">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VDK_STYLE[r.vdk].bg} ${VDK_STYLE[r.vdk].text} ${VDK_STYLE[r.vdk].border}`}>VDK {VDK_STYLE[r.vdk].label}</span>
                            {r.notes && <span className="ml-2 text-gray-500">{r.notes}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
                          {canDelete && <td />}
                        </tr>
                      )
                    }
                    const isStageEvent = r.plato == null && r.ph == null && r.notes?.startsWith('→')
                    if (isStageEvent) {
                      return (
                        <tr key={r.id} className="border-t border-gray-50 bg-gray-50/60">
                          <td className="px-3 py-1.5 text-gray-400">
                            {logDayTime(r.recorded_at, ', ')}
                          </td>
                          <td colSpan={2} className="px-3 py-1.5 text-center">
                            <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-[10px] font-medium tracking-wide">
                              {r.notes}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
{canDelete && <td className="px-1"><DeleteReading onClick={() => remove(r.id, logDayTime(r.recorded_at, ', '))} /></td>}
                        </tr>
                      )
                    }
                    if (r.plato == null && r.ph == null && r.notes) {
                      return (
                        <tr key={r.id} className="border-t border-gray-50">
                          <td className="px-3 py-1.5 text-gray-500">{logDayTime(r.recorded_at, ', ')}</td>
                          <td colSpan={2} className="px-3 py-1.5 text-gray-700">{r.notes}</td>
                          <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
                          {canDelete && <td className="px-1"><DeleteReading onClick={() => remove(r.id, logDayTime(r.recorded_at, ', '))} /></td>}
                        </tr>
                      )
                    }
                    return (
                      <tr key={r.id} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-500">
                          {logDayTime(r.recorded_at, ', ')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                          {r.plato != null ? `${r.plato}°P` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                          {r.ph != null ? r.ph : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
{canDelete && <td className="px-1"><DeleteReading onClick={() => remove(r.id, logDayTime(r.recorded_at, ', '))} /></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
