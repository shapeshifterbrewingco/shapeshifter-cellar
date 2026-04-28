'use client'

import { useState, useTransition } from 'react'
import { FlaskConical, BarChart2, MoreHorizontal, TestTube2, Package, Thermometer } from 'lucide-react'
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
import { updateBrewStage, endBrew, updateBatchCode } from '@/app/brews/actions'
import { setTankTarget } from '@/app/tanks/actions'
import { calcAbv } from '@/lib/utils'
import { PACKAGE_FORMATS, HOP_LOAD_LOSS } from '@/types'
import type { TankDashboardData, TankStage } from '@/types'
import type { RecipeOption } from '@/components/dashboard/AssignBrewModal'

interface TankCardProps {
  data: TankDashboardData
  recipes: RecipeOption[]
  currentUser: string
  allTanks: TankDashboardData[]
}

const STAGE_TRANSITIONS: { label: string; stage: TankStage }[] = [
  { label: 'Active Ferment', stage: 'active_ferment' },
  { label: 'Diacetyl Rest', stage: 'diacetyl_rest' },
  { label: 'VDK Pass', stage: 'vdk_pass' },
  { label: 'On Chill', stage: 'on_chill' },
]

export function TankCard({ data, recipes, currentUser, allTanks }: TankCardProps) {
  const { tank, brew, latest_gravity, temperature, set_point_c, temperature_recorded_at, days_in_tank, style_colour, latest_vdk, packaging_split } = data
  const isEmpty = !brew || brew.stage === 'empty'
  const stage = brew?.stage ?? 'empty'

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showLogModal, setShowLogModal] = useState(false)
  const [showChartModal, setShowChartModal] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showPackageModal, setShowPackageModal] = useState(false)
  const [showVdkModal, setShowVdkModal] = useState(false)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showEditBatch, setShowEditBatch] = useState(false)
  const [batchInput, setBatchInput] = useState(brew?.batch_code ?? '')
  const [showDiacetylModal, setShowDiacetylModal] = useState(false)
  const [diacetylTemp, setDiacetylTemp] = useState('21')
  const [showChillModal, setShowChillModal] = useState(false)
  const [chillTemp, setChillTemp] = useState('2')
  const [showSetpoint, setShowSetpoint] = useState(false)
  const [setpointInput, setSetpointInput] = useState('')
  const [setpointStatus, setSetpointStatus] = useState<'idle' | 'confirming' | 'saving' | 'done' | 'error'>('idle')
  const [setpointMsg, setSetpointMsg] = useState('')
  const [, startTransition] = useTransition()

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
      setDiacetylTemp('21')
      setShowDiacetylModal(true)
      return
    }
    if (newStage === 'on_chill') {
      setChillTemp('2')
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
              <span className={`text-sm font-bold px-3 py-1 rounded-full tabular-nums ${
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
          /* Empty: centred illustration + temperature underneath */
          <div className="flex flex-col items-center pb-2 pt-0.5 gap-1.5">
            <TankIllustration
              type={tank.type}
              style={null}
              styleColour={null}
              volume_l={null}
              temperature={temperature}
              days_in_tank={null}
              empty={true}
              stage={stage}
              width={80}
              height={130}
            />
            <div className="flex items-center gap-2">
              {temperature !== null ? (
                <span className="text-lg font-bold text-gray-500 tabular-nums">{temperature.toFixed(1)}°C</span>
              ) : (
                <span className="text-lg text-gray-300">—°C</span>
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
                width={80}
                height={150}
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
              Assign Brew
            </Button>
          ) : (
            <div className="flex w-full gap-2">
              {stage === 'diacetyl_rest' ? (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300 gap-1.5"
                    onClick={() => setShowVdkModal(true)}
                  >
                    <TestTube2 className="h-4 w-4" /> VDK Test
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                        const vdkPassed = stage === 'vdk_pass' || latest_vdk?.result === 'pass'
                        const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                        return (
                          <DropdownMenuItem
                            key={t.stage}
                            onClick={() => !vdkBlocked && handleStageChange(t.stage)}
                            disabled={vdkBlocked}
                          >
                            → {t.label}
                            {vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>
                        Est. packaging split…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>
                        Edit batch code…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>
                        Transfer to tank…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPackageModal(true)}>
                        Package / Keg…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>
                        Empty / CIP
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300 gap-1.5"
                    onClick={() => setShowLogModal(true)}
                  >
                    <FlaskConical className="h-4 w-4" /> Log
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 h-8 text-sm bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 gap-1.5"
                    onClick={() => setShowChartModal(true)}
                  >
                    <BarChart2 className="h-4 w-4" /> Chart
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="h-8 w-8 p-0 flex items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 cursor-pointer flex-shrink-0">
                      <MoreHorizontal className="h-5 w-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-sm">
                      {STAGE_TRANSITIONS.filter(t => t.stage !== stage).map(t => {
                        const vdkPassed = stage === 'vdk_pass' || latest_vdk?.result === 'pass'
                        const vdkBlocked = (t.stage === 'on_chill' || t.stage === 'vdk_pass') && !vdkPassed
                        return (
                          <DropdownMenuItem
                            key={t.stage}
                            onClick={() => !vdkBlocked && handleStageChange(t.stage)}
                            disabled={vdkBlocked}
                          >
                            → {t.label}
                            {vdkBlocked && <span className="ml-1.5 text-[10px] text-gray-400">VDK required</span>}
                          </DropdownMenuItem>
                        )
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowSplitModal(true)}>
                        Est. packaging split…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => { setBatchInput(brew?.batch_code ?? ''); setShowEditBatch(true) }}>
                        Edit batch code…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTransferModal(true)}>
                        Transfer to tank…
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowPackageModal(true)}>
                        Package / Keg…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={handleCip}>
                        Empty / CIP
                      </DropdownMenuItem>
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
            <Thermometer className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {!showSetpoint ? (
              <>
                <span className="text-xs text-gray-500 tabular-nums">
                  SP: {set_point_c != null && set_point_c !== 200 ? `${set_point_c.toFixed(1)}°C` : '—'}
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

      {showAssignModal && (
        <AssignBrewModal tank={tank} recipes={recipes} onClose={() => setShowAssignModal(false)} />
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
          onVdkPass={() => { setShowVdkModal(false); setChillTemp('2'); setShowChillModal(true) }}
        />
      )}
      {showSplitModal && brew && (
        <PackagingSplitModal brew={brew} onClose={() => setShowSplitModal(false)} />
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
