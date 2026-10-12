'use client'

import { useState, useEffect } from 'react'
import { X, FlaskConical } from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { getBrewChartData } from '@/app/brews/actions'
import { calcAbv, formatUserName } from '@/lib/utils'
import { VDK_STYLE, withVdk } from '@/lib/vdk'
import type { Brew, Tank } from '@/types'

interface Props {
  brew: Brew
  tank: Tank
  days_in_tank: number | null
  onClose: () => void
}

export type ChartData = Awaited<ReturnType<typeof getBrewChartData>>

interface ChartPoint {
  ts: number
  label: string
  plato: number | null
  ph: number | null
  temp: number | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium text-gray-600 mb-1">{label}</p>
      {payload.map((p: { color: string; name: string; value: number | null }) =>
        p.value != null ? (
          <p key={p.name} style={{ color: p.color }}>
            {p.name}: <span className="font-semibold tabular-nums">{p.value}</span>
          </p>
        ) : null
      )}
    </div>
  )
}

function mergeChartData(
  readings: ChartData['readings'],
  temps: ChartData['temps']
): ChartPoint[] {
  const map = new Map<number, ChartPoint>()

  for (const t of temps) {
    const ts = new Date(t.recorded_at).getTime()
    map.set(ts, {
      ts,
      label: format(parseISO(t.recorded_at), 'd MMM HH:mm'),
      plato: null,
      ph: null,
      temp: Number(t.temperature_c),
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
      temp: r.temperature_c != null ? Number(r.temperature_c) : existing?.temp ?? null,
    })
  }

  return [...map.values()].sort((a, b) => a.ts - b.ts)
}

/** Loads a brew's readings and tank temperatures once, for the chart and the readings list. */
// `refreshKey` changes when something new has been logged, so an open screen picks it up.
export function useBrewChart(brew: Brew, tank: Tank, refreshKey = '') {
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    getBrewChartData(brew.id, tank.id, brew.brew_day)
      .then((d) => { if (live) setData(d) })
      .catch(() => { /* chart stays empty; the rest of the screen still works */ })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [brew.id, tank.id, brew.brew_day, refreshKey])

  return { data, loading }
}

/** Gravity, pH and temperature over the life of a brew. */
export function FermentChart({ brew, data, loading, height = 280 }: {
  brew: Brew
  data: ChartData | null
  loading: boolean
  height?: number
}) {
  const readings = data?.readings ?? []
  const stageEvents = readings.filter((r) => r.plato == null && r.ph == null && r.notes?.startsWith('→'))
  const gravityReadings = readings.filter((r) => r.plato != null || r.ph != null)
  const chartData = data ? mergeChartData(data.readings, data.temps) : []

  const platoVals = readings.map((r) => r.plato).filter((v): v is number => v != null)
  const platoMin = platoVals.length ? Math.min(...platoVals) : 0
  const platoMax = brew.og_plato ?? (platoVals.length ? Math.max(...platoVals) : 20)
  const platoPad = Math.max((platoMax - platoMin) * 0.2, 1)

  const tempVals = chartData.map((p) => p.temp).filter((v): v is number => v != null)
  const tempMin = tempVals.length ? Math.floor(Math.min(...tempVals)) - 2 : 0
  const tempMax = tempVals.length ? Math.ceil(Math.max(...tempVals)) + 2 : 30

  const hasTemp = tempVals.length > 0
  const hasReadings = gravityReadings.length > 0 || stageEvents.length > 0

  return (
    <>
    {loading ? (
      <div className="h-56 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
    ) : !hasReadings && !hasTemp ? (
      <div className="h-56 flex flex-col items-center justify-center gap-2 text-gray-400">
        <FlaskConical className="h-8 w-8 text-gray-200" />
        <p className="text-sm">No readings logged yet.</p>
        <p className="text-xs">Use the Log button on the tank card to add readings.</p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'var(--chart-muted)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
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
            width={46}
          />

          {/* Right: Temperature °C */}
          <YAxis
            yAxisId="temp"
            orientation="right"
            domain={[tempMin, tempMax]}
            tick={{ fontSize: 10, fill: 'var(--chart-temp)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${Math.round(Number(v))}°C`}
            allowDecimals={false}
            width={40}
          />

          {/* pH axis: hidden, domain [3,6] keeps the line in a sensible position. Width 0 because a
              hidden axis still pushes the temperature axis outwards by its width, off the edge. */}
          <YAxis yAxisId="ph" orientation="right" domain={[3, 6]} hide width={0} />

          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span className="text-gray-500">{value}</span>}
          />

          {/* OG reference */}
          {brew.og_plato != null && (
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
              x={format(parseISO(e.recorded_at), 'd MMM HH:mm')}
              stroke="var(--chart-muted)"
              strokeDasharray="3 3"
              label={{ value: e.notes ?? '', fontSize: 8, fill: 'var(--chart-muted)', position: 'insideTopLeft', angle: -90 }}
            />
          ))}

          {/* Temperature line */}
          {hasTemp && (
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              name="Temp (°C)"
              stroke="var(--chart-temp)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          )}

          {/* Gravity line */}
          <Line
            yAxisId="plato"
            type="monotone"
            dataKey="plato"
            name="Gravity (°P)"
            stroke="var(--chart-gravity)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--chart-gravity)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />

          {/* pH line */}
          <Line
            yAxisId="ph"
            type="monotone"
            dataKey="ph"
            name="pH"
            stroke="var(--chart-ph)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--chart-ph)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    )}
    </>
  )
}

export function BrewChartModal({ brew, tank, days_in_tank, onClose }: Props) {
  const { data, loading } = useBrewChart(brew, tank)

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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{brew.beer_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {tank.name}
              {brew.style ? ` · ${brew.style}` : ''}
              {days_in_tank != null ? ` · Day ${days_in_tank}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

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
                  </tr>
                </thead>
                <tbody>
                  {withVdk(readings, data?.vdk).reverse().map((r) => {
                    if (r.vdk) {
                      return (
                        <tr key={r.id} className="border-t border-gray-50">
                          <td className="px-3 py-1.5 text-gray-500">{format(parseISO(r.recorded_at), 'd MMM, HH:mm')}</td>
                          <td colSpan={2} className="px-3 py-1.5 text-center">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VDK_STYLE[r.vdk].bg} ${VDK_STYLE[r.vdk].text} ${VDK_STYLE[r.vdk].border}`}>VDK {VDK_STYLE[r.vdk].label}</span>
                            {r.notes && <span className="ml-2 text-gray-500">{r.notes}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
                        </tr>
                      )
                    }
                    const isStageEvent = r.plato == null && r.ph == null && r.notes?.startsWith('→')
                    if (isStageEvent) {
                      return (
                        <tr key={r.id} className="border-t border-gray-50 bg-gray-50/60">
                          <td className="px-3 py-1.5 text-gray-400">
                            {format(parseISO(r.recorded_at), 'd MMM, HH:mm')}
                          </td>
                          <td colSpan={2} className="px-3 py-1.5 text-center">
                            <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-[10px] font-medium tracking-wide">
                              {r.notes}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={r.id} className="border-t border-gray-50">
                        <td className="px-3 py-1.5 text-gray-500">
                          {format(parseISO(r.recorded_at), 'd MMM, HH:mm')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                          {r.plato != null ? `${r.plato}°P` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                          {r.ph != null ? r.ph : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-gray-400">{formatUserName(r.recorded_by)}</td>
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
