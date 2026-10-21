'use client'

import { logDay } from '@/lib/log-date'
import { PackPlanSummary } from './PackPlan'
import { useEffect, useState } from 'react'
import { X, FlaskConical, ArrowRightLeft, MoreHorizontal } from 'lucide-react'
import { FermentChart, useBrewChart, DeleteReading } from '@/components/dashboard/BrewChartModal'
import { StageBadge } from './StageBadge'
import { TempTap } from './SetPoint'
import { calcAbv, formatUserName } from '@/lib/utils'
import { stageStyle } from '@/lib/stage-style'
import { VDK_STYLE, withVdk } from '@/lib/vdk'
import type { TankDashboardData, TankStage } from '@/types'

export interface SheetAction {
  label: string
  onSelect: () => void
  danger?: boolean
}

export interface StageOption {
  label: string
  stage: TankStage
  /** Why this stage cannot be picked yet, if it cannot */
  blocked?: string
}

/**
 * Everything about one tank, full screen, for a phone. Opens when a tank card
 * is tapped. It only shows and routes: every action here opens the same dialog
 * the card's own menu does, so there is one code path per action.
 */
export function TankDetailSheet({ data, stages, more, onLog, logLabel = 'Log reading', onStage, onVolume, onClose }: {
  data: TankDashboardData
  stages: StageOption[]
  more: SheetAction[]
  onLog: () => void
  /** What the main button says. It logs VDK for a tank on diacetyl rest. */
  logLabel?: string
  onStage: (stage: TankStage) => void
  /** Opens the volume dialog: bottoms off, or a corrected figure */
  onVolume: () => void
  onClose: () => void
}) {
  const { tank, latest_gravity, temperature, set_point_c, days_in_tank } = data
  const brew = data.brew!
  const { data: chart, loading, remove } = useBrewChart(brew, tank, `${latest_gravity?.recorded_at ?? ''}|${brew.stage}|${data.latest_vdk?.recorded_at ?? ''}|${data.latest_vdk?.result ?? ''}`)
  const [panel, setPanel] = useState<'stage' | 'more' | null>(null)

  // The page behind must not scroll while the sheet is up
  useEffect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = before }
  }, [])

  const abv = brew.og_plato != null && latest_gravity?.plato != null ? calcAbv(brew.og_plato, latest_gravity.plato) : null
  const cooling = set_point_c != null && set_point_c !== 200

  const stats: { label: string; value: string }[] = [
    { label: 'Gravity', value: latest_gravity?.plato != null ? `${latest_gravity.plato}°P` : '-' },
    { label: 'pH', value: latest_gravity?.ph != null ? String(latest_gravity.ph) : '-' },
    { label: 'ABV so far', value: abv != null ? `${abv.toFixed(1)}%` : '-' },
    { label: 'Tank temp', value: temperature != null ? `${temperature.toFixed(1)}°C` : '-' },
    { label: 'Set point', value: cooling ? `${set_point_c!.toFixed(1)}°C` : 'Off' },
    { label: 'Volume', value: `${Math.round(brew.volume_l).toLocaleString('en-AU')} L` },
  ]

  // Readings and VDK results together, newest first
  const recent = withVdk(chart?.readings ?? [], chart?.vdk).reverse().slice(0, 10)

  const pick = (fn: () => void) => () => { setPanel(null); fn() }
  const row = 'w-full text-left px-4 py-3.5 text-base font-medium border-b border-gray-100 last:border-b-0 active:bg-gray-50 disabled:text-gray-300'

  return (
    <div className="md:hidden fixed inset-0 z-[45] bg-background flex flex-col" role="dialog" aria-modal="true" aria-label={`${tank.name} details`}>
      {/* Header */}
      <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 bg-white border-b border-gray-200">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{tank.name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}</p>
          <h2 className="text-xl font-bold text-gray-900 leading-tight break-words">{brew.beer_name}</h2>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <StageBadge stage={brew.stage} />
            {days_in_tank != null && <span className="text-sm text-gray-500">Day {days_in_tank}</span>}
            {brew.style && <span className="text-sm text-gray-400">{brew.style}</span>}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex-shrink-0 h-11 w-11 -mr-1 -mt-1 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100">
          <X className="h-6 w-6" />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
        {/* In a brite, or an FV the beer was transferred into, packing is what is next, so the plan comes first */}
        {(tank.type === 'brite' || !!data.transferred_at) && (
          <PackPlanSummary brew={brew} tank={tank.name} split={data.sheet_split} plato={latest_gravity?.plato} abvNow={abv} />
        )}
        <section className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl px-2 py-2.5 text-center ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              <p className="text-[11px] text-gray-400">{s.label}</p>
              <p className="text-base font-bold tabular-nums text-gray-900 mt-0.5">
                {s.label === 'Tank temp' || s.label === 'Set point'
                  ? <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={temperature} setPoint={set_point_c}>{s.value}</TempTap>
                  : s.label === 'Volume'
                  ? <button type="button" onClick={onVolume} aria-label="Change volume" className="rounded-md underline decoration-dotted decoration-black/25 underline-offset-4 active:opacity-60">{s.value}</button>
                  : s.value}
              </p>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl pt-3 pb-1 px-1 ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <FermentChart brew={brew} data={chart} loading={loading} height={260} />
        </section>

        <section>
          <h3 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Readings and VDK</h3>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing logged yet.</p>
          ) : (
            <ul className="bg-white rounded-2xl divide-y divide-gray-100 ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
              {recent.map((r) => {
                const noteOnly = r.plato == null && r.ph == null
                return (
                  <li key={r.id} className="px-3 py-2.5 flex items-baseline gap-3 text-sm">
                    <span className="w-[4.5rem] flex-shrink-0 text-gray-400 tabular-nums">{logDay(r.recorded_at)}</span>
                    {r.vdk ? (
                      <span className="flex-1 min-w-0">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VDK_STYLE[r.vdk].bg} ${VDK_STYLE[r.vdk].text} ${VDK_STYLE[r.vdk].border}`}>VDK {VDK_STYLE[r.vdk].label}</span>
                        {r.notes && <span className="block text-xs text-gray-500 mt-0.5">{r.notes}</span>}
                      </span>
                    ) : noteOnly ? (
                      <span className="flex-1 min-w-0 text-gray-600 break-words">{r.notes}</span>
                    ) : (
                      <span className="flex-1 min-w-0">
                        <span className="tabular-nums text-gray-900 font-semibold">
                          {r.plato != null ? `${r.plato}°P` : ''}{r.plato != null && r.ph != null ? ' · ' : ''}{r.ph != null ? `pH ${r.ph}` : ''}
                        </span>
                        {r.temperature_c != null && <span className="tabular-nums text-gray-400"> · {Number(r.temperature_c).toFixed(1)}°C</span>}
                        {r.notes && <span className="block text-xs text-gray-500">{r.notes}</span>}
                      </span>
                    )}
                    {/* Who logged it, as the desktop chart shows */}
                    <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{formatUserName(r.recorded_by)}</span>
                    {chart?.canDelete && !r.vdk && <DeleteReading onClick={() => remove(r.id, logDay(r.recorded_at))} />}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {brew.notes && (
          <section>
            <h3 className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2">Brew notes</h3>
            <p className="bg-white rounded-2xl px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">{brew.notes}</p>
          </section>
        )}
      </div>

      {/* Stage / More choices slide in above the action bar */}
      {panel && (
        <>
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setPanel(null)} />
          <div className="relative bg-white border-t border-gray-200 rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto">
            {panel === 'stage' && (
              <p className="px-5 pt-3.5 pb-1 text-xs text-gray-500">
                Now on <span className="font-semibold text-gray-900">{stageStyle(brew.stage).label}</span>. Move it to:
              </p>
            )}
            {panel === 'stage'
              ? stages.map((s) => (
                  <button key={s.stage} type="button" disabled={!!s.blocked} onClick={pick(() => onStage(s.stage))} className={row}>
                    {s.label}{s.blocked && <span className="ml-2 text-xs font-normal text-gray-400">{s.blocked}</span>}
                  </button>
                ))
              : more.map((a) => (
                  <button key={a.label} type="button" onClick={pick(a.onSelect)} className={`${row} ${a.danger ? 'text-red-600' : 'text-gray-900'}`}>
                    {a.label}
                  </button>
                ))}
          </div>
        </>
      )}

      {/* Actions */}
      <footer className="relative grid grid-cols-[1.2fr_1.2fr_0.8fr] gap-2 px-4 pt-3 bg-white border-t border-gray-200"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={pick(onLog)}
          className="h-14 rounded-xl bg-primary text-white text-base font-semibold inline-flex items-center justify-center gap-2">
          <FlaskConical className="h-5 w-5" />{logLabel}
        </button>
        <button type="button" onClick={() => setPanel(panel === 'stage' ? null : 'stage')} aria-expanded={panel === 'stage'}
          className="h-14 rounded-xl border border-gray-300 text-gray-800 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 flex-shrink-0" />Change stage
        </button>
        <button type="button" onClick={() => setPanel(panel === 'more' ? null : 'more')} aria-expanded={panel === 'more'}
          className="h-14 rounded-xl border border-gray-300 text-gray-800 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
          <MoreHorizontal className="h-5 w-5" />More
        </button>
      </footer>
    </div>
  )
}
