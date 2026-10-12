'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FlaskConical, BarChart2, MoreHorizontal, TestTube2, Package, ChevronRight, ChevronDown, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TankIllustration } from './TankIllustration'
import { VDK_STYLE } from '@/lib/vdk'
import { BEER_COLOURS } from '@/types'
import { StageBadge } from './StageBadge'
import { TankDetailSheet } from './TankDetailSheet'
import { TempTap } from './SetPoint'
import type { SheetAction, StageOption } from './TankDetailSheet'
import { AssignBrewModal } from '@/components/dashboard/AssignBrewModal'
import { LogReadingModal } from '@/components/dashboard/LogReadingModal'
import { BrewChartModal } from '@/components/dashboard/BrewChartModal'
import { TransferModal } from '@/components/dashboard/TransferModal'
import { PackageModal } from '@/components/dashboard/PackageModal'
import { VdkModal } from '@/components/dashboard/VdkModal'
import { PackagingSplitModal } from '@/components/dashboard/PackagingSplitModal'
import { updateBrewStage, endBrew, updateBatchCode, updateBrewVolume, renameBrew } from '@/app/brews/actions'
import { setTankTarget } from '@/app/tanks/actions'
import { calcAbv } from '@/lib/utils'
import { stageStyle, IN_PRODUCTION, inProduction } from '@/lib/stage-style'
import { toast } from 'sonner'
import type { TankDashboardData, TankStage, AppSettings } from '@/types'
import type { RecipeOption } from '@/components/dashboard/AssignBrewModal'

interface TankCardProps {
  data: TankDashboardData
  recipes: RecipeOption[]
  currentUser: string
  allTanks: TankDashboardData[]
  settings: AppSettings
  cardSize?: 'small' | 'medium' | 'large'
  listMode?: boolean
  /** Half-height desktop card. Two of these stack in one grid cell. */
  compact?: boolean
}

const STAGE_TRANSITIONS: { label: string; stage: TankStage }[] = [
  { label: 'Active Ferment', stage: 'active_ferment' },
  { label: 'Diacetyl Rest', stage: 'diacetyl_rest' },
  { label: 'VDK Pass', stage: 'vdk_pass' },
  { label: 'On Chill', stage: 'on_chill' },
]

export function TankCard({ data, recipes, currentUser, allTanks, settings, cardSize = 'medium', listMode = false, compact = false }: TankCardProps) {
  const { tank, brew, latest_gravity, temperature, set_point_c, days_in_tank, style_colour, latest_vdk, packaging_split, next_scheduled_brew } = data
  const isEmpty = !brew || brew.stage === 'empty'
  const stage = brew?.stage ?? 'empty'
  const vdkPassed = stage === 'vdk_pass' || latest_vdk?.result === 'pass'
  // On diacetyl rest the daily test is VDK, so that is what the main button logs
  const onDiacetylRest = stage === 'diacetyl_rest'

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showVdkModal, setShowVdkModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showEditBatch, setShowEditBatch] = useState(false)
  const [batchInput, setBatchInput] = useState(brew?.batch_code ?? '')
  const [showEditVolume, setShowEditVolume] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [nameInput, setNameInput] = useState(brew?.beer_name ?? '')
  const [styleInput, setStyleInput] = useState(brew?.style ?? '')
  const [colourInput, setColourInput] = useState<string | null>(brew?.colour ?? null)
  const [volumeInput, setVolumeInput] = useState(String(brew?.volume_l ?? ''))
  const [showDiacetylModal, setShowDiacetylModal] = useState(false)
  const [diacetylTemp, setDiacetylTemp] = useState(String(settings.diacetyl_rest_temp_c))
  const [showChillModal, setShowChillModal] = useState(false)
  const [chillTemp, setChillTemp] = useState(String(settings.on_chill_temp_c))
  const [showSetpoint, setShowSetpoint] = useState(false)
  const [setpointInput, setSetpointInput] = useState('')
  const [setpointStatus, setSetpointStatus] = useState<'idle' | 'confirming' | 'saving' | 'done' | 'error'>('idle')
  const [setpointMsg, setSetpointMsg] = useState('')
  const [listExpanded, setListExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Every card action goes through here: one at a time, and a failure is said
  // out loud instead of landing on the crash screen.
  function run(action: () => Promise<unknown>, failure: string) {
    if (isPending) return
    startTransition(async () => {
      try { await action() } catch { toast.error(failure) }
    })
  }

  // Sends a set point to the glycol controller after a stage change. Returns
  // false if the number typed is not a usable temperature.
  function validTarget(input: string): number | null {
    const temp = parseFloat(input)
    if (isNaN(temp) || temp < -5 || temp > 40) {
      toast.error('Enter a temperature between -5 and 40°C')
      return null
    }
    return temp
  }

  function changeStageAndTarget(newStage: TankStage, temp: number) {
    if (!brew) return
    run(async () => {
      await updateBrewStage(brew.id, tank.id, newStage)
      if (!tank.frigid_asset_id) return
      const res = await setTankTarget(tank.id, temp)
      if (res.success) toast.success(`${tank.name} set to ${temp}°C`)
      else toast.error(`Stage changed, but ${tank.name} was NOT set to ${temp}°C: ${res.message}`, { duration: 15000 })
    }, `Could not change the stage on ${tank.name}. Check the connection and try again.`)
  }

  // Illustration size based on cardSize
  const illW = cardSize === 'small' ? 60 : cardSize === 'large' ? 100 : 80
  const illH = cardSize === 'small' ? 113 : cardSize === 'large' ? 188 : 150

  function handleSetpointOpen() {
    setSetpointInput(set_point_c != null && set_point_c !== 200 ? String(set_point_c) : '')
    setSetpointStatus('idle')
    setSetpointMsg('')
    setShowSetpoint(true)
  }

  function handleSetpointConfirm() {
    const val = parseFloat(setpointInput)
    if (isNaN(val) || val < -5 || val > 40) { setSetpointMsg('Enter a temp between -5 and 40°C'); return }
    setSetpointStatus('confirming')
    setSetpointMsg(`Set ${tank.name} to ${val}°C?`)
  }

  function handleSetpointSave() {
    const val = parseFloat(setpointInput)
    setSetpointStatus('saving')
    startTransition(async () => {
      const res = await setTankTarget(tank.id, val)
      if (res.success) {
        setSetpointStatus('done')
        setSetpointMsg(res.message)
        setTimeout(() => setShowSetpoint(false), 1500)
      } else {
        setSetpointStatus('error')
        setSetpointMsg(res.message)
      }
    })
  }

  function handleStageChange(newStage: TankStage) {
    if (!brew) return
    if (newStage === 'diacetyl_rest') {
      setDiacetylTemp(String(settings.diacetyl_rest_temp_c))
      setShowDiacetylModal(true)
      return
    }
    if (newStage === 'on_chill') {
      setChillTemp(String(settings.on_chill_temp_c))
      setShowChillModal(true)
      return
    }
    run(() => updateBrewStage(brew.id, tank.id, newStage), `Could not change the stage on ${tank.name}. Check the connection and try again.`)
  }

  function handleChillConfirm() {
    const temp = validTarget(chillTemp)
    if (temp == null) return
    setShowChillModal(false)
    changeStageAndTarget('on_chill', temp)
  }

  function handleDiacetylConfirm() {
    const temp = validTarget(diacetylTemp)
    if (temp == null) return
    setShowDiacetylModal(false)
    changeStageAndTarget('diacetyl_rest', temp)
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault()
    if (!brew || !nameInput.trim()) return
    setShowRename(false)
    run(async () => {
      const res = await renameBrew(brew.id, nameInput, styleInput, colourInput)
      if (!res.ok) toast.error(res.message)
    }, 'Could not rename the beer. Try again.')
  }

  const router = useRouter()
  const openBrewSheet = () => { if (brew) router.push(`/brews/${brew.id}/sheet`) }

  // On a phone, tapping the card (anywhere that is not already a button) opens
  // the full-screen detail sheet. Menu items live in a portal but their clicks
  // still bubble up to here through React, hence the role checks.
  function handleCardTap(e: React.MouseEvent) {
    if (isEmpty || !window.matchMedia('(max-width: 767px)').matches) return
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label, [role="menu"], [role="menuitem"], [role="dialog"]')) return
    setShowDetail(true)
  }

  // Arriving from the Dashboard with ?tank=<id>: open this tank's detail and
  // ferment chart straight away, then tidy the address so a refresh does not reopen it.
  const hasBrew = !!brew && !isEmpty
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('tank') !== tank.id || !hasBrew) return
    // The phone has a full detail screen; desktop cards open the chart
    /* eslint-disable react-hooks/set-state-in-effect -- the address bar is only readable after mount */
    if (window.matchMedia('(min-width: 768px)').matches) setShowChartModal(true)
    else setShowDetail(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    url.searchParams.delete('tank')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [tank.id, hasBrew])

  const sheetStages: StageOption[] = STAGE_TRANSITIONS
    .filter((t) => t.stage !== stage)
    .map((t) => ({
      ...t,
      blocked: (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed ? 'VDK required' : undefined,
    }))

  // The one thing most likely to happen next, by stage. Once fermentation is
  // signed off (VDK pass or on chill) there is nothing left to log: the beer moves.
  const doneFermenting = stage === 'vdk_pass' || stage === 'on_chill'
  // Started, but OG not in yet: the brew day is still going, and the sheet is where it is recorded
  const brewDayOpen = inProduction(brew)
  const nextStep: { label: string; run: () => void } =
    brewDayOpen ? { label: 'Brew sheet', run: () => { if (brew) router.push(`/brews/${brew.id}/sheet`) } }
    : onDiacetylRest ? { label: 'Log VDK', run: () => setShowVdkModal(true) }
    : doneFermenting && tank.type === 'brite' ? { label: 'Package', run: () => setShowPackageModal(true) }
    : doneFermenting ? { label: 'Transfer', run: () => setShowTransferModal(true) }
    : { label: 'Log reading', run: () => setShowLogModal(true) }

  // On diacetyl rest the last VDK result is the thing to know at a glance
  const vdkLine = !onDiacetylRest ? null : latest_vdk && VDK_STYLE[latest_vdk.result] ? (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VDK_STYLE[latest_vdk.result].bg} ${VDK_STYLE[latest_vdk.result].text} ${VDK_STYLE[latest_vdk.result].border}`}>
      VDK {VDK_STYLE[latest_vdk.result].label}
    </span>
  ) : <span className="text-[11px] text-gray-400">No VDK logged</span>

  const sheetMore: SheetAction[] = [
    { label: 'Brew sheet', onSelect: openBrewSheet },
    onDiacetylRest
      ? { label: 'Log gravity or pH', onSelect: () => setShowLogModal(true) }
      : { label: 'Log VDK result', onSelect: () => setShowVdkModal(true) },
    { label: 'Packaging plan', onSelect: () => setShowSplitModal(true) },
    { label: 'Rename beer, style or colour', onSelect: () => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) } },
    { label: 'Edit batch code', onSelect: () => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) } },
    { label: 'Edit volume', onSelect: () => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) } },
    { label: 'Transfer to tank', onSelect: () => setShowTransferModal(true) },
    { label: 'Package / keg', onSelect: () => setShowPackageModal(true) },
    { label: 'Empty for cleaning', onSelect: handleCip, danger: true },
  ]

  const detailSheet = showDetail && brew && !isEmpty ? (
    <TankDetailSheet
      data={data}
      stages={sheetStages}
      more={sheetMore}
      logLabel={nextStep.label}
      onLog={nextStep.run}
      onStage={handleStageChange}
      onClose={() => setShowDetail(false)}
    />
  ) : null

  const renameDialog = showRename && brew ? (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowRename(false)}>
      <form onSubmit={handleRename} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Beer in {tank.name}</h2>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Name</span>
          <input type="text" value={nameInput} onChange={e => setNameInput(e.target.value)}
            maxLength={120} autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Style</span>
          <input type="text" value={styleInput} onChange={e => setStyleInput(e.target.value)}
            maxLength={80} placeholder="e.g. Hazy IPA"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <div>
          <span className="block text-xs text-gray-500 mb-1.5">Beer colour on the tank</span>
          <div className="flex flex-wrap gap-2">
            {BEER_COLOURS.map((c) => (
              <button key={c.hex} type="button" onClick={() => setColourInput(c.hex)} aria-label={c.name} aria-pressed={colourInput === c.hex} title={c.name}
                className={`h-9 w-9 rounded-full ring-1 ring-black/10 ${colourInput === c.hex ? 'outline outline-2 outline-offset-2 outline-primary' : ''}`}
                style={{ backgroundColor: c.hex }} />
            ))}
          </div>
          <button type="button" onClick={() => setColourInput(null)} aria-pressed={colourInput === null}
            className={`mt-2 text-xs font-medium ${colourInput === null ? 'text-gray-400' : 'text-primary'}`}>
            {colourInput === null ? 'Using the style\u2019s colour' : 'Go back to the style\u2019s colour'}
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowRename(false)}
            className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={!nameInput.trim()}
            className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90 disabled:opacity-40">Save</button>
        </div>
      </form>
    </div>
  ) : null

  function handleCip() {
    if (!brew) return
    if (!confirm(`Empty ${tank.name} for CIP? This will free the tank.`)) return
    run(() => endBrew(brew.id, 'cleaning'), `Could not empty ${tank.name}. Try again.`)
  }

  const showGravity = latest_gravity?.plato != null
  const showPh = latest_gravity?.ph != null
  const abv =
    brew?.og_plato != null && latest_gravity?.plato != null
      ? calcAbv(brew.og_plato, latest_gravity.plato)
      : null

  // ── Left-border colour for list mode ──────────────────────────────────────
  const listBorderColour = stageStyle(stage).accent

  // ── Phone layout ──────────────────────────────────────────────────────────
  // One calm white card per tank: name and stage on top, four numbers below.
  // No buttons: tapping the card opens the detail screen, which has them all.
  // Stage is the only thing that carries colour.
  const look = brew && inProduction(brew) ? IN_PRODUCTION : stageStyle(stage)
  const phoneStats: [string, string][] = [
    ['Gravity', latest_gravity?.plato != null ? `${latest_gravity.plato}°P` : '-'],
    ['pH', latest_gravity?.ph != null ? String(latest_gravity.ph) : '-'],
    ['ABV', abv != null ? `${abv.toFixed(1)}%` : '-'],
    ['Temp', temperature != null ? `${temperature.toFixed(1)}°` : '-'],
  ]

  const mobileRow = isEmpty || !brew ? (
    <div className="tank-empty md:hidden flex items-center gap-3 rounded-2xl bg-white/60 ring-1 ring-black/5 px-4 py-3">
      <span className="w-12 flex-shrink-0 text-[15px] font-semibold text-gray-400 tabular-nums">{tank.name}</span>
      <div className="flex-1 min-w-0">
        {next_scheduled_brew ? (
          <>
            <p className="text-sm text-gray-700 truncate">{next_scheduled_brew.recipe?.name ?? next_scheduled_brew.recipe_name ?? 'Untitled'}</p>
            <p className="text-xs text-gray-400">
              Next brew, {new Date(next_scheduled_brew.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-400">Empty</p>
        )}
      </div>
      {/* A brite is filled by a transfer, never by starting a brew */}
      {tank.type !== 'brite' && (
        <button type="button" onClick={() => setShowAssignModal(true)}
          className="flex-shrink-0 h-9 px-3.5 rounded-full bg-primary/10 text-primary text-sm font-semibold active:bg-primary/20">
          Start brew
        </button>
      )}
    </div>
  ) : (
    <div onClick={handleCardTap} role="button" tabIndex={0} aria-label={`${tank.name}, ${brew.beer_name}. Open details`}
      onKeyDown={(e) => { if (e.key === 'Enter') setShowDetail(true) }}
      className="tank-full md:hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 pt-3.5 pb-3 active:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold tracking-wide text-gray-400">
            {tank.name}<span className="font-normal"> · Day {days_in_tank ?? '-'}</span>
          </p>
          <p className="text-[17px] font-semibold leading-snug text-gray-900 truncate">{brew.beer_name}</p>
          <p className="text-[13px] text-gray-500 truncate">
            {[brew.style, `${Math.round(brew.volume_l).toLocaleString('en-AU')} L`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className={`inline-flex items-center gap-1.5 rounded-full pl-2 pr-2.5 py-1 text-xs font-medium ${look.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
            {look.label}
          </span>
          {vdkLine}
        </div>
      </div>
      <dl className="grid grid-cols-4 mt-3 pt-2.5 border-t border-gray-100">
        {phoneStats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] text-gray-400">{label}</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-gray-900">
              {label === 'Temp'
                ? (
                  <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={temperature} setPoint={set_point_c} className="text-left leading-tight">
                    <span className="block">{value}</span>
                    <span className="block text-[11px] font-normal text-gray-400 whitespace-nowrap">
                      {set_point_c != null && set_point_c !== 200 ? `Set to ${set_point_c.toFixed(1)}°` : 'No set point'}
                    </span>
                  </TempTap>
                )
                : value}
            </dd>
          </div>
        ))}
      </dl>
      {brewDayOpen && (
        <button type="button" onClick={(e) => { e.stopPropagation(); nextStep.run() }}
          className="mt-3 w-full h-10 rounded-xl bg-yeast/60 text-charcoal text-sm font-semibold inline-flex items-center justify-center gap-1.5 active:bg-yeast">
          <ClipboardList className="h-4 w-4" />Brew day in progress. Open brew sheet
        </button>
      )}
      {doneFermenting && (
        <button type="button" onClick={(e) => { e.stopPropagation(); nextStep.run() }}
          className="mt-3 w-full h-10 rounded-xl bg-primary/10 text-primary text-sm font-semibold inline-flex items-center justify-center gap-1.5 active:bg-primary/20">
          {tank.type === 'brite' ? <Package className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{nextStep.label}
        </button>
      )}
    </div>
  )

  // ── Compact desktop card ──────────────────────────────────────────────────
  // Everything the full card says, in half the height: no drawing, one line each.
  const compactCard = (
    <div className={`${isEmpty ? 'tank-empty' : 'tank-full'} hidden md:flex flex-1 min-h-0 flex-col justify-between gap-2 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 py-3`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-semibold text-gray-900 tracking-tight leading-none whitespace-nowrap">{tank.name}</span>
        {isEmpty || !brew
          ? <span className="text-xs text-gray-400">Empty</span>
          : <StageBadge stage={stage} inProduction={inProduction(brew)} />}
      </div>

      <div className="min-w-0">
        {isEmpty || !brew ? (
          next_scheduled_brew ? (
            <p className="text-sm text-gray-700 truncate">
              <span className="text-gray-400">Next: </span>{next_scheduled_brew.recipe?.name ?? next_scheduled_brew.recipe_name ?? 'Untitled'}
              <span className="text-gray-400"> · {new Date(next_scheduled_brew.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
            </p>
          ) : <p className="text-sm text-gray-300">Nothing booked</p>
        ) : (
          <>
            <p className="text-[15px] font-semibold text-gray-900 leading-tight truncate">{brew.beer_name}</p>
            <p className="text-xs text-gray-500 truncate tabular-nums">
              {[days_in_tank != null ? `Day ${days_in_tank}` : null, `${Math.round(brew.volume_l).toLocaleString('en-AU')} L`,
                latest_gravity?.plato != null ? `${latest_gravity.plato}°P` : null,
                abv != null ? `${abv.toFixed(1)}%` : null,
                latest_gravity?.ph != null ? `pH ${latest_gravity.ph}` : null].filter(Boolean).join(' · ')}
            </p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={temperature} setPoint={set_point_c} className="flex-shrink-0 leading-tight">
          <span className="block text-base font-semibold tabular-nums text-gray-900">{temperature != null ? `${temperature.toFixed(1)}°C` : '-'}</span>
          <span className="block text-[11px] text-gray-400 tabular-nums">{set_point_c != null && set_point_c !== 200 ? `Set to ${set_point_c.toFixed(1)}°C` : 'No set point'}</span>
        </TempTap>
        <div className="ml-auto flex items-center gap-2">
          {isEmpty || !brew ? (
            tank.type === 'brite'
              ? <span className="text-xs text-gray-400">Empty, filled by transfer</span>
              : <Button size="sm" className="h-8 text-sm px-4" onClick={() => setShowAssignModal(true)}>Start Brew</Button>
          ) : (
            <>
              <Button size="sm" variant="outline"
                className="h-8 text-sm bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                onClick={nextStep.run}>
                {nextStep.label}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer flex-shrink-0">
                  <MoreHorizontal className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-sm">
                  {sheetStages.map((st) => (
                    <DropdownMenuItem key={st.stage} disabled={!!st.blocked} onClick={() => !st.blocked && handleStageChange(st.stage)}>
                      → {st.label}{st.blocked && <span className="ml-1.5 text-[10px] text-gray-400">{st.blocked}</span>}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log Reading…</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowChartModal(true)}>View Chart…</DropdownMenuItem>
                  {sheetMore.map((a) => (
                    <DropdownMenuItem key={a.label} className={a.danger ? 'text-red-600 focus:text-red-600' : undefined} onClick={a.onSelect}>{a.label}…</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (listMode) {
    return (
      <>
        {detailSheet}
        {mobileRow}
        <div className={`hidden md:block bg-white border border-gray-200 border-l-4 ${listBorderColour} rounded-xl shadow-sm overflow-hidden`}>
          {/* Summary row */}
          <button
            type="button"
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            onClick={() => setListExpanded(x => !x)}
          >
            {listExpanded
              ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
            }

            {/* Tank name */}
            <span className="w-12 flex-shrink-0 text-xs font-bold text-gray-700 uppercase tracking-wide">
              {tank.name}
            </span>

            {/* Beer / empty info */}
            <div className="flex-1 min-w-0">
              {isEmpty ? (
                <span className="text-sm text-gray-400">
                  {next_scheduled_brew
                    ? `Next: ${next_scheduled_brew.recipe?.name ?? next_scheduled_brew.recipe_name ?? 'Untitled'}`
                    : 'Empty'}
                </span>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-gray-900 truncate">{brew.beer_name}</span>
                    {brew.batch_code && (
                      <span className="text-xs font-bold text-gray-400 tabular-nums flex-shrink-0">{brew.batch_code}</span>
                    )}
                  </div>
                  {brew.style && <p className="text-xs text-gray-500 leading-none mt-0.5">{brew.style}</p>}
                </>
              )}
            </div>

            {/* Stage badge — hidden on small screens */}
            {!isEmpty && <div className="hidden sm:block flex-shrink-0"><StageBadge stage={stage} inProduction={inProduction(brew)} /></div>}

            {/* Gravity + ABV — hidden on small screens */}
            {showGravity && (
              <span className="text-sm font-bold text-gray-700 tabular-nums flex-shrink-0 hidden md:block">
                {latest_gravity!.plato}°P
              </span>
            )}
            {abv != null && (
              <span className="text-sm font-bold text-hops tabular-nums flex-shrink-0 hidden md:block">
                {abv.toFixed(1)}%
              </span>
            )}

            {/* Temperature */}
            <span className="text-sm font-bold text-gray-500 tabular-nums flex-shrink-0">
              {temperature != null ? `${temperature.toFixed(1)}°` : '—°'}
            </span>

            {/* Days in tank */}
            {days_in_tank != null && (
              <span className="text-xs font-bold text-gray-400 tabular-nums flex-shrink-0 hidden sm:block">
                {days_in_tank}d
              </span>
            )}
          </button>

          {/* Expanded content */}
          {listExpanded && (
            <div className="border-t border-gray-100">
              {/* Body */}
              {isEmpty ? (
                <div className="flex items-center gap-0 px-4 py-3">
                  <div className="flex items-center justify-center flex-shrink-0">
                    <TankIllustration
                      type={tank.type} style={null} styleColour={null}
                      volume_l={null} temperature={temperature} days_in_tank={null}
                      empty={true} stage={stage} width={80} height={150}
                    />
                  </div>
                  <div className="flex flex-col justify-center flex-1 min-w-0 pl-4 gap-2">
                    {next_scheduled_brew ? (
                      <div>
                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">Next brew</p>
                        <p className="text-sm font-bold text-gray-800 leading-tight">
                          {next_scheduled_brew.recipe?.name ?? next_scheduled_brew.recipe_name ?? 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(next_scheduled_brew.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-300 mb-1.5">Empty</p>
                        <Link href="/planner" className="text-xs font-semibold text-primary hover:opacity-80 border border-primary/30 hover:border-primary/60 px-2.5 py-1 rounded-lg transition-colors inline-block">
                    Plan a brew
                  </Link>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-0 px-4 py-3">
                  <div className="flex items-center justify-center flex-shrink-0">
                    <TankIllustration
                      type={tank.type} style={brew?.style ?? null} styleColour={style_colour}
                      volume_l={brew.volume_l} temperature={temperature} days_in_tank={null}
                      empty={false} stage={stage} width={80} height={150}
                    />
                  </div>
                  <div className="flex flex-col justify-center flex-1 min-w-0 pl-4 gap-1.5">
                    <div className="min-w-0">
                      <p className="text-base font-bold text-gray-900 leading-tight">{brew.beer_name}</p>
                      {brew.style && <p className="text-xs text-gray-500 mt-0.5">{brew.style}</p>}
                    </div>
                    <StageBadge stage={stage} inProduction={inProduction(brew)} />
                    {stage === 'diacetyl_rest' && (() => {
                      const VDK_STYLES: Record<string, string> = {
                        high: 'bg-red-50 text-red-700 border-red-200', medium: 'bg-malt/15 text-malt-dark border-malt/40',
                        low: 'bg-yeast/30 text-charcoal border-yeast', pass: 'bg-water/30 text-hops border-water',
                      }
                      const VDK_LABELS: Record<string, string> = { high: 'VDK High', medium: 'VDK Medium', low: 'VDK Low', pass: 'VDK Pass' }
                      if (!latest_vdk) return <span className="text-[11px] text-gray-400">No VDK logged</span>
                      return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border self-start ${VDK_STYLES[latest_vdk.result] ?? ''}`}>{VDK_LABELS[latest_vdk.result] ?? latest_vdk.result}</span>
                    })()}
                    {(showGravity || showPh) && (
                      <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                        {showGravity && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.plato}°P</span>}
                        {abv != null && <span className="text-sm font-bold text-hops tabular-nums">{abv.toFixed(1)}% ABV</span>}
                        {showPh && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.ph} pH</span>}
                      </div>
                    )}
                    {packaging_split && (
                      <button type="button" onClick={() => setShowSplitModal(true)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 self-start">
                        <Package className="h-3 w-3" /> Show splits
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className={`border-t px-3 py-1.5 ${
                stage === 'active_ferment' ? 'border-yeast bg-yeast/30' :
                stage === 'diacetyl_rest'  ? 'border-water bg-water/30' :
                stage === 'on_chill'       ? 'border-water bg-water/30' :
                'border-gray-100'
              }`}>
                {isEmpty ? (
                  tank.type === 'brite'
                    ? <p className="h-8 flex items-center justify-center text-xs text-gray-400">Filled by transfer</p>
                    : <Button size="sm" className="w-full h-8 text-sm" onClick={() => setShowAssignModal(true)}>
                        Start Brew
                      </Button>
                ) : (
                  <div className="flex w-full gap-2">
                    {stage === 'diacetyl_rest' ? (
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm bg-yeast/30 border-yeast text-charcoal hover:bg-yeast/30 hover:border-yeast gap-1.5"
                          onClick={() => setShowVdkModal(true)}>
                          <TestTube2 className="h-4 w-4" /> Log VDK
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-yeast bg-yeast/30 text-charcoal hover:bg-yeast/30 cursor-pointer flex-shrink-0">
                            <MoreHorizontal className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log gravity or pH…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                              const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                              return (
                                <DropdownMenuItem key={t.stage} onClick={() => !vdkBlocked && handleStageChange(t.stage)} disabled={vdkBlocked}>
                                  → {t.label}{vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                                </DropdownMenuItem>
                              )
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowPackageModal(true)}>Package / Keg…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : stage === 'vdk_pass' ? (
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm px-2 bg-malt/15 border-malt/40 text-malt-dark hover:bg-malt/15 hover:border-malt/40 gap-1.5"
                          onClick={() => handleStageChange('on_chill')}>
                          → Chill
                        </Button>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm px-2 bg-malt/15 border-malt/40 text-malt-dark hover:bg-malt/15 hover:border-malt/40 gap-1.5"
                          onClick={nextStep.run}>
                          {tank.type === 'brite' ? <Package className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {nextStep.label}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-malt/40 bg-malt/15 text-malt-dark hover:bg-malt/15 cursor-pointer flex-shrink-0">
                            <MoreHorizontal className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => (
                              <DropdownMenuItem key={t.stage} onClick={() => handleStageChange(t.stage)}>
                                → {t.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log Reading…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowChartModal(true)}>View Chart…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : stage === 'on_chill' ? (
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm bg-water/30 border-water text-hops hover:bg-water/30 hover:border-water gap-1.5"
                          onClick={() => tank.type === 'fermenter' ? setShowTransferModal(true) : setShowPackageModal(true)}>
                          {tank.type === 'fermenter'
                            ? <><ChevronRight className="h-4 w-4" /> Transfer</>
                            : <><Package className="h-4 w-4" /> Package / Keg</>}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-water bg-water/30 text-hops hover:bg-water/30 cursor-pointer flex-shrink-0">
                            <MoreHorizontal className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => (
                              <DropdownMenuItem key={t.stage} onClick={() => handleStageChange(t.stage)}>
                                → {t.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log Reading…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowChartModal(true)}>View Chart…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : (
                      /* active_ferment */
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm bg-water/30 border-water text-hops hover:bg-water/30 hover:border-water gap-1.5"
                          onClick={nextStep.run}>
                          {brewDayOpen ? <><ClipboardList className="h-4 w-4" /> Brew sheet</> : <><FlaskConical className="h-4 w-4" /> Log Reading</>}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-water bg-water/30 text-hops hover:bg-water/30 cursor-pointer flex-shrink-0">
                            <MoreHorizontal className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            <DropdownMenuItem onClick={() => setShowChartModal(true)}>
                              <BarChart2 className="h-4 w-4 mr-1.5" /> View Chart…
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                              const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                              return (
                                <DropdownMenuItem key={t.stage} onClick={() => !vdkBlocked && handleStageChange(t.stage)} disabled={vdkBlocked}>
                                  → {t.label}{vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                                </DropdownMenuItem>
                              )
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowPackageModal(true)}>Package / Keg…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Setpoint */}
              {tank.frigid_asset_id && (
                <div className={`border-t px-3 py-1.5 flex items-center gap-2 ${
                  stage === 'active_ferment' ? 'border-yeast bg-yeast/30' :
                  stage === 'diacetyl_rest'  ? 'border-water bg-water/30' :
                  stage === 'on_chill'       ? 'border-water bg-water/30' :
                  'border-gray-100 bg-gray-50/50'
                }`}>
                  {!showSetpoint ? (
                    <>
                      <span className="text-xs text-gray-500 tabular-nums">
                        <span className="font-bold">Set Point:</span> {set_point_c != null && set_point_c !== 200 ? `${set_point_c.toFixed(1)}°C` : '—'}
                      </span>
                      <button type="button" onClick={handleSetpointOpen}
                        className="ml-auto text-[11px] text-primary hover:underline font-medium">Set</button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 w-full">
                      {setpointStatus === 'confirming' ? (
                        <>
                          <span className="text-xs text-gray-700 flex-1">{setpointMsg}</span>
                          <button type="button" onClick={() => setSetpointStatus('idle')} className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded">No</button>
                          <button type="button" onClick={handleSetpointSave} className="text-[11px] bg-primary text-white px-2 py-0.5 rounded font-medium">Yes</button>
                        </>
                      ) : setpointStatus === 'saving' ? (
                        <span className="text-xs text-gray-400 flex-1">Sending…</span>
                      ) : setpointStatus === 'done' ? (
                        <span className="text-xs text-hops flex-1">{setpointMsg}</span>
                      ) : (
                        <>
                          <input type="number" step="0.5" value={setpointInput}
                            onChange={e => { setSetpointInput(e.target.value); setSetpointMsg('') }}
                            onKeyDown={e => e.key === 'Enter' && handleSetpointConfirm()}
                            placeholder="°C" autoFocus
                            className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40" />
                          {setpointMsg && <span className="text-[10px] text-red-500">{setpointMsg}</span>}
                          <button type="button" onClick={handleSetpointConfirm} className="text-[11px] bg-primary text-white px-2 py-0.5 rounded font-medium ml-auto">Set</button>
                          <button type="button" onClick={() => setShowSetpoint(false)} className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals — identical to card mode */}
        {showDiacetylModal && brew && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Move to Diacetyl Rest</h2>
                <p className="text-xs text-gray-500 mt-1">{tank.name} will be moved to Diacetyl Rest. Set the target temperature below.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Target temp (°C)</label>
                <input type="number" step="0.5" value={diacetylTemp} onChange={e => setDiacetylTemp(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowDiacetylModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleDiacetylConfirm}
                  className="flex-1 bg-hops text-white text-sm font-medium py-2 rounded-lg hover:bg-hops">Confirm</button>
              </div>
            </div>
          </div>
        )}
        {showChillModal && brew && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Move to On Chill</h2>
                <p className="text-xs text-gray-500 mt-1">{tank.name} will be moved to On Chill. Set the target temperature below.</p>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Target temp (°C)</label>
                <input type="number" step="0.5" value={chillTemp} onChange={e => setChillTemp(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowChillModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={handleChillConfirm}
                  className="flex-1 bg-hops text-white text-sm font-medium py-2 rounded-lg hover:bg-hops">Confirm</button>
              </div>
            </div>
          </div>
        )}
        {showAssignModal && (
          <AssignBrewModal tank={tank} recipes={recipes} defaultVolumeL={settings.default_brew_volume_l}
            plannedName={next_scheduled_brew?.recipe?.name ?? next_scheduled_brew?.recipe_name}
            onClose={() => setShowAssignModal(false)} />
        )}
        {showLogModal && brew && (
          <LogReadingModal brew={brew} tank={tank} currentUser={currentUser} onClose={() => setShowLogModal(false)} />
        )}
        {showChartModal && brew && (
          <BrewChartModal brew={brew} tank={tank} days_in_tank={days_in_tank} onClose={() => setShowChartModal(false)} />
        )}
        {showTransferModal && brew && (
          <TransferModal brew={brew} sourceTank={tank} allTanks={allTanks} onClose={() => setShowTransferModal(false)} />
        )}
        {showPackageModal && brew && (
          <PackageModal brew={brew} tank={tank} onClose={() => setShowPackageModal(false)} />
        )}
        {showVdkModal && brew && (
          <VdkModal brew={brew} tank={tank} currentUser={currentUser} onClose={() => setShowVdkModal(false)}
            onVdkPass={() => { setShowVdkModal(false); setChillTemp(String(settings.on_chill_temp_c)); setShowChillModal(true) }} />
        )}
        {showSplitModal && brew && (
          <PackagingSplitModal brewId={brew.id} title={brew.beer_name} subtitle={`${brew.volume_l} L in tank`}
            volume_l={brew.volume_l} defaultHopLoad={settings.default_hop_load} settings={settings} onClose={() => setShowSplitModal(false)} />
        )}
        {renameDialog}
        {showEditBatch && brew && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Edit batch code</h2>
              <input type="text" value={batchInput} onChange={e => setBatchInput(e.target.value)}
                placeholder="e.g. 2026-001" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowEditBatch(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={() => { run(() => updateBatchCode(brew.id, batchInput), 'Could not save the batch code. It may already be in use.'); setShowEditBatch(false) }}
                  className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90">Save</button>
              </div>
            </div>
          </div>
        )}
        {showEditVolume && brew && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900">Edit volume</h2>
              <div className="flex items-center gap-2">
                <input type="number" inputMode="decimal" step="1" min="0" value={volumeInput}
                  onChange={e => setVolumeInput(e.target.value)} autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-sm text-gray-500 font-medium flex-shrink-0">L</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowEditVolume(false)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="button" onClick={() => {
                  const v = parseFloat(volumeInput)
                  if (!isNaN(v) && v > 0) run(() => updateBrewVolume(brew.id, v), 'Could not save the volume. Try again.')
                  setShowEditVolume(false)
                }} className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90">Save</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      {detailSheet}
      {mobileRow}
      {compact && compactCard}
      <div className={`${compact ? 'hidden' : 'hidden md:flex'} ${isEmpty ? 'tank-empty' : 'tank-full'} flex-col rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden w-full`}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-lg font-semibold text-gray-900 tracking-tight leading-none">{tank.name}</span>
          <div className="flex items-center gap-2">
            {brew?.batch_code && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full tabular-nums bg-gray-100 text-gray-600">
                {brew.batch_code}
              </span>
            )}
            {days_in_tank !== null && !isEmpty && (
              <span title="Days in tank" className="text-xs font-medium tabular-nums text-gray-500">
                Day {days_in_tank}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        {isEmpty ? (
          /* Empty: illustration left, info right */
          <div className="flex items-center gap-0 px-3 pb-2 pt-0.5">
            <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={temperature} setPoint={set_point_c} className="flex items-center justify-center flex-shrink-0 hover:no-underline">
              <TankIllustration
                type={tank.type}
                style={null}
                styleColour={null}
                volume_l={null}
                temperature={temperature}
                days_in_tank={null}
                empty={true}
                stage={stage}
                width={illW}
                height={illH}
              />
            </TempTap>
            <div className="flex flex-col justify-center flex-1 min-w-0 pl-3 gap-1.5">
              {next_scheduled_brew ? (
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-none mb-0.5">Next brew</p>
                  <p className="text-sm font-semibold text-gray-800 leading-tight">
                    {next_scheduled_brew.recipe?.name ?? next_scheduled_brew.recipe_name ?? 'Untitled'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(next_scheduled_brew.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-300">Empty</p>
                  <Link href="/planner" className="text-xs font-semibold text-primary hover:opacity-80 border border-primary/30 hover:border-primary/60 px-2.5 py-1 rounded-lg transition-colors block inline-block">
                    Plan a brew
                  </Link>
                  <p className="text-[10px] text-gray-300 leading-tight">Opens the Planner</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Occupied: illustration left, data right */
          <div className="flex items-center gap-0 px-3 pb-2 pt-0.5">
            <TempTap tankId={tank.frigid_asset_id ? tank.id : null} name={tank.name} temperature={temperature} setPoint={set_point_c} className="flex items-center justify-center flex-shrink-0 hover:no-underline">
              <TankIllustration
                type={tank.type}
                style={brew?.style ?? null}
                styleColour={style_colour}
                volume_l={brew.volume_l}
                temperature={temperature}
                days_in_tank={null}
                empty={false}
                stage={stage}
                width={illW}
                height={illH}
              />
            </TempTap>

            <div className="flex flex-col justify-center flex-1 min-w-0 pl-3 gap-1.5">
              {/* Beer name + style */}
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-gray-900 leading-tight">{brew.beer_name}</p>
                {brew.style && <p className="text-xs text-gray-500 mt-0.5 leading-tight">{brew.style}</p>}
              </div>

              {/* Stage badge */}
              <StageBadge stage={stage} inProduction={inProduction(brew)} />

              {/* Latest VDK result — diacetyl rest only */}
              {stage === 'diacetyl_rest' && (() => {
                const VDK_STYLES: Record<string, string> = {
                  high:   'bg-red-50 text-red-700 border-red-200',
                  medium: 'bg-malt/15 text-malt-dark border-malt/40',
                  low:    'bg-yeast/30 text-charcoal border-yeast',
                  pass:   'bg-water/30 text-hops border-water',
                }
                const VDK_LABELS: Record<string, string> = { high: 'VDK High', medium: 'VDK Medium', low: 'VDK Low', pass: 'VDK Pass' }
                if (!latest_vdk) return <span className="text-[11px] text-gray-400">No VDK logged</span>
                const style = VDK_STYLES[latest_vdk.result] ?? ''
                return (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border self-start ${style}`}>
                    {VDK_LABELS[latest_vdk.result] ?? latest_vdk.result}
                  </span>
                )
              })()}

              {/* Gravity / ABV / pH */}
              {(showGravity || showPh) && (
                stage === 'active_ferment' ? (
                  <div className="flex flex-col gap-0.5 leading-tight">
                    <div className="flex items-baseline gap-1.5">
                      {showGravity && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{latest_gravity!.plato}°P</span>}
                      {showPh && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{latest_gravity!.ph} pH</span>}
                    </div>
                    {abv != null && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{abv.toFixed(1)}% ABV</span>}
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                    {showGravity && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{latest_gravity!.plato}°P</span>}
                    {abv != null && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{abv.toFixed(1)}% ABV</span>}
                    {showPh && <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">{latest_gravity!.ph} pH</span>}
                  </div>
                )
              )}

              {/* Packaging split button */}
              {packaging_split && (
                <button type="button" onClick={() => setShowSplitModal(true)}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors leading-tight mt-0.5 self-start">
                  <Package className="h-3 w-3 flex-shrink-0" />
                  Show splits
                </button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto border-t border-gray-100 px-3 py-2">
          {isEmpty ? (
            tank.type === 'brite'
              ? <p className="h-8 flex items-center justify-center text-xs text-gray-400">Filled by transfer</p>
              : <Button size="sm" className="w-full h-8 text-sm" onClick={() => setShowAssignModal(true)}>
                  Start Brew
                </Button>
          ) : (
            <div className="flex w-full gap-2">
              {stage === 'diacetyl_rest' ? (
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                    onClick={() => setShowVdkModal(true)}>
                    <TestTube2 className="h-4 w-4" /> Log VDK
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log gravity or pH…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                        const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                        return (
                          <DropdownMenuItem key={t.stage} onClick={() => !vdkBlocked && handleStageChange(t.stage)} disabled={vdkBlocked}>
                            → {t.label}{vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPackageModal(true)}>Package / Keg…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : stage === 'vdk_pass' ? (
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm px-2 bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                    onClick={() => handleStageChange('on_chill')}>
                    → Chill
                  </Button>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm px-2 bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                    onClick={nextStep.run}>
                    {tank.type === 'brite' ? <Package className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {nextStep.label}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => (
                        <DropdownMenuItem key={t.stage} onClick={() => handleStageChange(t.stage)}>→ {t.label}</DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log Reading…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowChartModal(true)}>View Chart…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : stage === 'on_chill' ? (
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                    onClick={() => tank.type === 'fermenter' ? setShowTransferModal(true) : setShowPackageModal(true)}>
                    {tank.type === 'fermenter'
                      ? <><ChevronRight className="h-4 w-4" /> Transfer</>
                      : <><Package className="h-4 w-4" /> Package / Keg</>}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => (
                        <DropdownMenuItem key={t.stage} onClick={() => handleStageChange(t.stage)}>→ {t.label}</DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowLogModal(true)}>Log Reading…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowChartModal(true)}>View Chart…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                /* active_ferment */
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-primary/10 border-transparent text-primary hover:bg-primary/15 hover:text-primary gap-1.5"
                    onClick={nextStep.run}>
                    {brewDayOpen ? <><ClipboardList className="h-4 w-4" /> Brew sheet</> : <><FlaskConical className="h-4 w-4" /> Log Reading</>}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      <DropdownMenuItem onClick={() => setShowChartModal(true)}>
                        <BarChart2 className="h-4 w-4 mr-1.5" /> View Chart…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                        const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                        return (
                          <DropdownMenuItem key={t.stage} onClick={() => !vdkBlocked && handleStageChange(t.stage)} disabled={vdkBlocked}>
                            → {t.label}{vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>Packaging Plan…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={openBrewSheet}>Brew sheet…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setNameInput(brew?.beer_name ?? ''); setStyleInput(brew?.style ?? ''); setColourInput(brew?.colour ?? null); setShowRename(true) }}>Rename beer or style…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setVolumeInput(String(brew?.volume_l ?? '')); setShowEditVolume(true) }}>Edit volume…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPackageModal(true)}>Package / Keg…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>

        {/* Setpoint control — only shown for tanks with a Frigid asset ID */}
        {tank.frigid_asset_id && (
          <div className="border-t border-gray-100 px-4 py-1.5 flex items-center gap-2">
            {!showSetpoint ? (
              <>
                <TempTap tankId={tank.id} name={tank.name} temperature={temperature} setPoint={set_point_c} className="text-xs text-gray-500 tabular-nums">
                  <span className="text-gray-400">Set point</span> {set_point_c != null && set_point_c !== 200 ? `${set_point_c.toFixed(1)}°C` : '—'}
                </TempTap>
                <button
                  type="button"
                  onClick={handleSetpointOpen}
                  className="ml-auto text-[11px] text-primary hover:underline font-medium"
                >
                  Set
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 w-full">
                {setpointStatus === 'confirming' ? (
                  <>
                    <span className="text-xs text-gray-700 flex-1">{setpointMsg}</span>
                    <button type="button" onClick={() => setSetpointStatus('idle')}
                      className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded">No</button>
                    <button type="button" onClick={handleSetpointSave}
                      className="text-[11px] bg-primary text-white px-2 py-0.5 rounded font-medium">Yes</button>
                  </>
                ) : setpointStatus === 'saving' ? (
                  <span className="text-xs text-gray-400 flex-1">Sending…</span>
                ) : setpointStatus === 'done' ? (
                  <span className="text-xs text-hops flex-1">{setpointMsg}</span>
                ) : (
                  <>
                    <input
                      type="number"
                      step="0.5"
                      value={setpointInput}
                      onChange={e => { setSetpointInput(e.target.value); setSetpointMsg('') }}
                      onKeyDown={e => e.key === 'Enter' && handleSetpointConfirm()}
                      placeholder="°C"
                      autoFocus
                      className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                    />
                    {setpointMsg && <span className="text-[10px] text-red-500">{setpointMsg}</span>}
                    <button type="button" onClick={handleSetpointConfirm}
                      className="text-[11px] bg-primary text-white px-2 py-0.5 rounded font-medium ml-auto">Set</button>
                    <button type="button" onClick={() => setShowSetpoint(false)}
                      className="text-[11px] text-gray-400 hover:text-gray-600">✕</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showDiacetylModal && brew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Move to Diacetyl Rest</h2>
              <p className="text-xs text-gray-500 mt-1">{tank.name} will be moved to Diacetyl Rest. Set the target temperature below.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Target temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={diacetylTemp}
                onChange={e => setDiacetylTemp(e.target.value)}
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDiacetylModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiacetylConfirm}
                className="flex-1 bg-hops text-white text-sm font-medium py-2 rounded-lg hover:bg-hops"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showChillModal && brew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Move to On Chill</h2>
              <p className="text-xs text-gray-500 mt-1">{tank.name} will be moved to On Chill. Set the target temperature below.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Target temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={chillTemp}
                onChange={e => setChillTemp(e.target.value)}
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowChillModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChillConfirm}
                className="flex-1 bg-hops text-white text-sm font-medium py-2 rounded-lg hover:bg-hops"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {showAssignModal && (
        <AssignBrewModal tank={tank} recipes={recipes} defaultVolumeL={settings.default_brew_volume_l}
            plannedName={next_scheduled_brew?.recipe?.name ?? next_scheduled_brew?.recipe_name}
            onClose={() => setShowAssignModal(false)} />
      )}
      {showLogModal && brew && (
        <LogReadingModal brew={brew} tank={tank} currentUser={currentUser} onClose={() => setShowLogModal(false)} />
      )}
      {showChartModal && brew && (
        <BrewChartModal brew={brew} tank={tank} days_in_tank={days_in_tank} onClose={() => setShowChartModal(false)} />
      )}
      {showTransferModal && brew && (
        <TransferModal brew={brew} sourceTank={tank} allTanks={allTanks} onClose={() => setShowTransferModal(false)} />
      )}
      {showPackageModal && brew && (
        <PackageModal brew={brew} tank={tank} onClose={() => setShowPackageModal(false)} />
      )}
      {showVdkModal && brew && (
        <VdkModal
          brew={brew} tank={tank} currentUser={currentUser}
          onClose={() => setShowVdkModal(false)}
          onVdkPass={() => { setShowVdkModal(false); setChillTemp(String(settings.on_chill_temp_c)); setShowChillModal(true) }}
        />
      )}
      {showSplitModal && brew && (
        <PackagingSplitModal
          brewId={brew.id}
          title={brew.beer_name}
          subtitle={`${brew.volume_l} L in tank`}
          volume_l={brew.volume_l}
          defaultHopLoad={settings.default_hop_load}
          settings={settings}
          onClose={() => setShowSplitModal(false)}
        />
      )}
      {renameDialog}
      {showEditBatch && brew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Edit batch code</h2>
            <input
              type="text"
              value={batchInput}
              onChange={e => setBatchInput(e.target.value)}
              placeholder="e.g. 2026-001"
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEditBatch(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  run(() => updateBatchCode(brew.id, batchInput), 'Could not save the batch code. It may already be in use.')
                  setShowEditBatch(false)
                }}
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditVolume && brew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Edit volume</h2>
            <div className="flex items-center gap-2">
              <input
                type="number" inputMode="decimal"
                step="1"
                min="0"
                value={volumeInput}
                onChange={e => setVolumeInput(e.target.value)}
                autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <span className="text-sm text-gray-500 font-medium flex-shrink-0">L</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowEditVolume(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = parseFloat(volumeInput)
                  if (!isNaN(v) && v > 0) run(() => updateBrewVolume(brew.id, v), 'Could not save the volume. Try again.')
                  setShowEditVolume(false)
                }}
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
