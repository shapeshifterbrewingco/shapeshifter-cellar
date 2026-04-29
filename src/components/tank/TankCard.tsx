'use client'

import { useState, useTransition } from 'react'
import { FlaskConical, BarChart2, MoreHorizontal, TestTube2, Package, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TankIllustration } from './TankIllustration'
import { StageBadge } from './StageBadge'
import { AssignBrewModal } from '@/components/dashboard/AssignBrewModal'
import { LogReadingModal } from '@/components/dashboard/LogReadingModal'
import { BrewChartModal } from '@/components/dashboard/BrewChartModal'
import { TransferModal } from '@/components/dashboard/TransferModal'
import { PackageModal } from '@/components/dashboard/PackageModal'
import { VdkModal } from '@/components/dashboard/VdkModal'
import { PackagingSplitModal } from '@/components/dashboard/PackagingSplitModal'
import { BrewModal } from '@/components/schedule/BrewModal'
import { updateBrewStage, endBrew, updateBatchCode } from '@/app/brews/actions'
import { setTankTarget } from '@/app/tanks/actions'
import { calcAbv } from '@/lib/utils'
import { PACKAGE_FORMATS, HOP_LOAD_LOSS } from '@/types'
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
}

const STAGE_TRANSITIONS: { label: string; stage: TankStage }[] = [
  { label: 'Active Ferment', stage: 'active_ferment' },
  { label: 'Diacetyl Rest', stage: 'diacetyl_rest' },
  { label: 'VDK Pass', stage: 'vdk_pass' },
  { label: 'On Chill', stage: 'on_chill' },
]

export function TankCard({ data, recipes, currentUser, allTanks, settings, cardSize = 'medium', listMode = false }: TankCardProps) {
  const { tank, brew, latest_gravity, temperature, set_point_c, temperature_recorded_at, days_in_tank, style_colour, latest_vdk, packaging_split, next_scheduled_brew } = data
  const isEmpty = !brew || brew.stage === 'empty'
  const stage = brew?.stage ?? 'empty'
  const vdkPassed = stage === 'vdk_pass' || latest_vdk?.result === 'pass'

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showVdkModal, setShowVdkModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showEditBatch, setShowEditBatch] = useState(false)
  const [batchInput, setBatchInput] = useState(brew?.batch_code ?? '')
  const [showDiacetylModal, setShowDiacetylModal] = useState(false)
  const [diacetylTemp, setDiacetylTemp] = useState(String(settings.diacetyl_rest_temp_c))
  const [showChillModal, setShowChillModal] = useState(false)
  const [chillTemp, setChillTemp] = useState(String(settings.on_chill_temp_c))
  const [showSetpoint, setShowSetpoint] = useState(false)
  const [setpointInput, setSetpointInput] = useState('')
  const [setpointStatus, setSetpointStatus] = useState<'idle' | 'confirming' | 'saving' | 'done' | 'error'>('idle')
  const [setpointMsg, setSetpointMsg] = useState('')
  const [listExpanded, setListExpanded] = useState(false)
  const [, startTransition] = useTransition()

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
    startTransition(() => updateBrewStage(brew.id, tank.id, newStage))
  }

  function handleChillConfirm() {
    if (!brew) return
    const temp = parseFloat(chillTemp)
    setShowChillModal(false)
    startTransition(async () => {
      await updateBrewStage(brew.id, tank.id, 'on_chill')
      if (!isNaN(temp) && tank.frigid_asset_id) {
        await setTankTarget(tank.id, temp)
      }
    })
  }

  function handleDiacetylConfirm() {
    if (!brew) return
    const temp = parseFloat(diacetylTemp)
    setShowDiacetylModal(false)
    startTransition(async () => {
      await updateBrewStage(brew.id, tank.id, 'diacetyl_rest')
      if (!isNaN(temp) && tank.frigid_asset_id) {
        await setTankTarget(tank.id, temp)
      }
    })
  }

  function handleCip() {
    if (!brew) return
    if (!confirm(`Empty ${tank.name} for CIP? This will free the tank.`)) return
    startTransition(() => endBrew(brew.id, 'cleaning'))
  }

  const showOg = brew?.og_plato != null
  const showGravity = latest_gravity?.plato != null
  const showPh = latest_gravity?.ph != null
  const abv =
    brew?.og_plato != null && latest_gravity?.plato != null
      ? calcAbv(brew.og_plato, latest_gravity.plato)
      : null

  // ── Left-border colour for list mode ──────────────────────────────────────
  const listBorderColour =
    stage === 'active_ferment' ? 'border-l-amber-400' :
    stage === 'diacetyl_rest'  ? 'border-l-violet-400' :
    stage === 'on_chill'       ? 'border-l-blue-600' :
    stage === 'vdk_pass'       ? 'border-l-orange-400' :
    'border-l-gray-200'

  if (listMode) {
    return (
      <>
        <div className={`bg-white border border-gray-200 border-l-4 ${listBorderColour} rounded-xl shadow-sm overflow-hidden`}>
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
            <span className="w-12 flex-shrink-0 text-xs font-black text-gray-700 uppercase tracking-wide">
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
            {!isEmpty && <div className="hidden sm:block flex-shrink-0"><StageBadge stage={stage} /></div>}

            {/* Gravity + ABV — hidden on small screens */}
            {showGravity && (
              <span className="text-sm font-bold text-gray-700 tabular-nums flex-shrink-0 hidden md:block">
                {latest_gravity!.plato}°P
              </span>
            )}
            {abv != null && (
              <span className="text-sm font-bold text-indigo-600 tabular-nums flex-shrink-0 hidden md:block">
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
                        <button type="button" onClick={() => setShowScheduleModal(true)}
                          className="text-xs font-semibold text-primary hover:opacity-80 border border-primary/30 hover:border-primary/60 px-2.5 py-1 rounded-lg transition-colors">
                          Schedule brew
                        </button>
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
                      <p className="text-base font-black text-gray-900 leading-tight">{brew.beer_name}</p>
                      {brew.style && <p className="text-xs text-gray-500 mt-0.5">{brew.style}</p>}
                    </div>
                    <StageBadge stage={stage} />
                    {stage === 'diacetyl_rest' && (() => {
                      const VDK_STYLES: Record<string, string> = {
                        high: 'bg-red-50 text-red-700 border-red-200', medium: 'bg-orange-50 text-orange-700 border-orange-200',
                        low: 'bg-yellow-50 text-yellow-700 border-yellow-200', pass: 'bg-green-100 text-green-700 border-green-300',
                      }
                      const VDK_LABELS: Record<string, string> = { high: 'VDK High', medium: 'VDK Medium', low: 'VDK Low', pass: 'VDK Pass' }
                      if (!latest_vdk) return <span className="text-[11px] text-gray-400">No VDK logged</span>
                      return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border self-start ${VDK_STYLES[latest_vdk.result] ?? ''}`}>{VDK_LABELS[latest_vdk.result] ?? latest_vdk.result}</span>
                    })()}
                    {(showGravity || showPh) && (
                      <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                        {showGravity && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.plato}°P</span>}
                        {abv != null && <span className="text-sm font-bold text-indigo-600 tabular-nums">{abv.toFixed(1)}% ABV</span>}
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
                stage === 'active_ferment' ? 'border-amber-200 bg-amber-100/40' :
                stage === 'diacetyl_rest'  ? 'border-violet-200 bg-violet-100/40' :
                stage === 'on_chill'       ? 'border-blue-200 bg-sky-100/40' :
                'border-gray-100'
              }`}>
                {isEmpty ? (
                  <Button size="sm" className="w-full h-8 text-sm" onClick={() => setShowAssignModal(true)}>
                    Start Brew
                  </Button>
                ) : (
                  <div className="flex w-full gap-2">
                    {stage === 'diacetyl_rest' ? (
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 gap-1.5"
                          onClick={() => setShowVdkModal(true)}>
                          <TestTube2 className="h-4 w-4" /> VDK Test
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer flex-shrink-0">
                            <MoreHorizontal className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
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
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
                          className="flex-1 h-8 text-sm bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300 gap-1.5"
                          onClick={() => handleStageChange('on_chill')}>
                          → Move to Chill
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer flex-shrink-0">
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
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : stage === 'on_chill' ? (
                      <>
                        <Button size="sm" variant="outline"
                          className="flex-1 h-8 text-sm bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 hover:border-sky-300 gap-1.5"
                          onClick={() => setShowPackageModal(true)}>
                          <Package className="h-4 w-4" /> Package / Keg
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 cursor-pointer flex-shrink-0">
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
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
                          className="flex-1 h-8 text-sm bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300 gap-1.5"
                          onClick={() => setShowLogModal(true)}>
                          <FlaskConical className="h-4 w-4" /> Log Reading
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 cursor-pointer flex-shrink-0">
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
                            <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
                  stage === 'active_ferment' ? 'border-amber-200 bg-amber-50/60' :
                  stage === 'diacetyl_rest'  ? 'border-violet-200 bg-violet-50/60' :
                  stage === 'on_chill'       ? 'border-sky-200 bg-sky-50/60' :
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
                        <span className="text-xs text-emerald-600 flex-1">{setpointMsg}</span>
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
                  className="flex-1 bg-violet-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-violet-700">Confirm</button>
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
                  className="flex-1 bg-sky-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-sky-700">Confirm</button>
              </div>
            </div>
          </div>
        )}
        {showScheduleModal && (
          <BrewModal state={{ mode: 'create' }} recipes={recipes}
            tanks={allTanks.map(t => ({ id: t.tank.id, name: t.tank.name }))}
            settings={settings} initialTankId={tank.id} onClose={() => setShowScheduleModal(false)} />
        )}
        {showAssignModal && (
          <AssignBrewModal tank={tank} recipes={recipes} defaultVolumeL={settings.default_brew_volume_l} onClose={() => setShowAssignModal(false)} />
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
                <button type="button" onClick={() => { startTransition(() => updateBatchCode(brew.id, batchInput)); setShowEditBatch(false) }}
                  className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90">Save</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className={`flex flex-col rounded-2xl shadow-md overflow-hidden w-full ${
        stage === 'active_ferment' ? 'bg-amber-50 border-2 border-amber-400 shadow-amber-100' :
        stage === 'diacetyl_rest' ? 'bg-violet-50 border-2 border-violet-400 shadow-violet-100' :
        stage === 'on_chill'      ? 'bg-sky-50 border-2 border-blue-600 shadow-blue-100' :
        stage === 'vdk_pass'      ? 'bg-white border-2 border-orange-400' :
        'bg-white border border-gray-200'
      }`}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <span className="text-2xl font-black text-gray-900 tracking-tight leading-none">{tank.name}</span>
          <div className="flex items-center gap-2">
            {brew?.batch_code && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full tabular-nums tracking-wide ${
                stage === 'active_ferment' ? 'bg-amber-100 text-amber-700' :
                stage === 'diacetyl_rest' ? 'bg-violet-100 text-violet-700' :
                stage === 'on_chill'      ? 'bg-sky-100 text-sky-700' :
                'bg-gray-100 text-gray-500'
              }`}>
                {brew.batch_code}
              </span>
            )}
            {days_in_tank !== null && !isEmpty && (
              <span title="Days in tank" className={`text-sm font-bold px-3 py-1 rounded-full tabular-nums ${
                stage === 'active_ferment' ? 'bg-amber-100 text-amber-700' :
                stage === 'diacetyl_rest' ? 'bg-violet-100 text-violet-700' :
                stage === 'on_chill'      ? 'bg-sky-100 text-sky-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {days_in_tank}d
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        {isEmpty ? (
          /* Empty: illustration left, info right */
          <div className="flex items-center gap-0 px-3 pb-2 pt-0.5">
            <div className="flex items-center justify-center flex-shrink-0">
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
            </div>
            <div className="flex flex-col justify-center flex-1 min-w-0 pl-3 gap-1.5">
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
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-300">Empty</p>
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(true)}
                    className="text-xs font-semibold text-primary hover:opacity-80 border border-primary/30 hover:border-primary/60 px-2.5 py-1 rounded-lg transition-colors block"
                  >
                    Schedule brew
                  </button>
                  <p className="text-[10px] text-gray-300 leading-tight">Plan a future brew date</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Occupied: illustration left, data right */
          <div className="flex items-center gap-0 px-3 pb-2 pt-0.5">
            <div className="flex items-center justify-center flex-shrink-0">
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
            </div>

            <div className="flex flex-col justify-center flex-1 min-w-0 pl-3 gap-1.5">
              {/* Beer name + style */}
              <div className="min-w-0">
                <p className="text-base font-black text-gray-900 leading-tight">{brew.beer_name}</p>
                {brew.style && <p className="text-xs text-gray-500 mt-0.5 leading-tight">{brew.style}</p>}
              </div>

              {/* Stage badge */}
              <StageBadge stage={stage} />

              {/* Latest VDK result — diacetyl rest only */}
              {stage === 'diacetyl_rest' && (() => {
                const VDK_STYLES: Record<string, string> = {
                  high:   'bg-red-50 text-red-700 border-red-200',
                  medium: 'bg-orange-50 text-orange-700 border-orange-200',
                  low:    'bg-yellow-50 text-yellow-700 border-yellow-200',
                  pass:   'bg-green-100 text-green-700 border-green-300',
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
                      {showGravity && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.plato}°P</span>}
                      {showPh && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.ph} pH</span>}
                    </div>
                    {abv != null && <span className="text-sm font-bold text-indigo-600 tabular-nums">{abv.toFixed(1)}% ABV</span>}
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1.5 flex-wrap leading-tight">
                    {showGravity && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.plato}°P</span>}
                    {abv != null && <span className="text-sm font-bold text-indigo-600 tabular-nums">{abv.toFixed(1)}% ABV</span>}
                    {showPh && <span className="text-sm font-bold text-gray-900 tabular-nums">{latest_gravity!.ph} pH</span>}
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
        <div className={`border-t px-3 py-1.5 ${
          stage === 'active_ferment' ? 'border-amber-200 bg-amber-100/40' :
          stage === 'diacetyl_rest' ? 'border-violet-200 bg-violet-100/40' :
          stage === 'on_chill'      ? 'border-blue-200 bg-sky-100/40' :
          'border-gray-100'
        }`}>
          {isEmpty ? (
            <Button size="sm" className="w-full h-8 text-sm" onClick={() => setShowAssignModal(true)}>
              Start Brew
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              {stage === 'diacetyl_rest' ? (
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 gap-1.5"
                    onClick={() => setShowVdkModal(true)}>
                    <TestTube2 className="h-4 w-4" /> VDK Test
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
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
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
                    className="flex-1 h-8 text-sm bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300 gap-1.5"
                    onClick={() => handleStageChange('on_chill')}>
                    → Move to Chill
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer flex-shrink-0">
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
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>Transfer to tank…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>Empty for Cleaning</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : stage === 'on_chill' ? (
                <>
                  <Button size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100 hover:border-sky-300 gap-1.5"
                    onClick={() => setShowPackageModal(true)}>
                    <Package className="h-4 w-4" /> Package / Keg
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 cursor-pointer flex-shrink-0">
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
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
                    className="flex-1 h-8 text-sm bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300 gap-1.5"
                    onClick={() => setShowLogModal(true)}>
                    <FlaskConical className="h-4 w-4" /> Log Reading
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 cursor-pointer flex-shrink-0">
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
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>Edit batch code…</DropdownMenuItem>
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
          <div className={`border-t px-3 py-1.5 flex items-center gap-2 ${
            stage === 'active_ferment' ? 'border-amber-200 bg-amber-50/60' :
            stage === 'diacetyl_rest' ? 'border-violet-200 bg-violet-50/60' :
            stage === 'on_chill'      ? 'border-sky-200 bg-sky-50/60' :
            'border-gray-100 bg-gray-50/50'
          }`}>
            {!showSetpoint ? (
              <>
                <span className="text-xs text-gray-500 tabular-nums">
                  <span className="font-bold">Set Point:</span> {set_point_c != null && set_point_c !== 200 ? `${set_point_c.toFixed(1)}°C` : '—'}
                </span>
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
                  <span className="text-xs text-emerald-600 flex-1">{setpointMsg}</span>
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
                className="flex-1 bg-violet-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-violet-700"
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
                className="flex-1 bg-sky-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-sky-700"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && (
        <BrewModal
          state={{ mode: 'create' }}
          recipes={recipes}
          tanks={allTanks.map(t => ({ id: t.tank.id, name: t.tank.name }))}
          settings={settings}
          initialTankId={tank.id}
          onClose={() => setShowScheduleModal(false)}
        />
      )}
      {showAssignModal && (
        <AssignBrewModal tank={tank} recipes={recipes} defaultVolumeL={settings.default_brew_volume_l} onClose={() => setShowAssignModal(false)} />
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
                  startTransition(() => updateBatchCode(brew.id, batchInput))
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
    </>
  )
}
