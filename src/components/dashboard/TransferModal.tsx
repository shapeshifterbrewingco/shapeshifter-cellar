'use client'

import { useState, useTransition } from 'react'
import { X, ArrowRight, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { transferBrew } from '@/app/brews/actions'
import type { Brew, Tank, TankDashboardData } from '@/types'

interface Props {
  brew: Brew
  sourceTank: Tank
  allTanks: TankDashboardData[]
  onClose: () => void
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1">
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )
}

function TempInput({ label, value, onChange, unit = '°C' }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <div className="flex-1">
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step="0.1"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm pr-7 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 accent-primary"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

export function TransferModal({ brew, sourceTank, allTanks, onClose }: Props) {
  const available = allTanks.filter(
    t => t.tank.id !== sourceTank.id && (!t.brew || t.brew.stage === 'empty')
  )

  // Core fields
  const [destTankId, setDestTankId] = useState(available[0]?.tank.id ?? '')
  const [volumeOut, setVolumeOut] = useState(String(brew.volume_l))
  const [batchCode, setBatchCode] = useState(brew.batch_code ?? '')
  const [notes, setNotes] = useState('')

  // Sections open/closed
  const [preOpen, setPreOpen] = useState(true)
  const [postOpen, setPostOpen] = useState(true)

  // Pre-transfer
  const [briteCoolingOn, setBriteCoolingOn] = useState(false)
  const [fvTempPre, setFvTempPre] = useState('')
  const [briteTempPre, setBriteTempPre] = useState('')
  const [purgeStart, setPurgeStart] = useState('')
  const [purgeFinish, setPurgeFinish] = useState('')
  const [transferStart, setTransferStart] = useState('')
  const [transferFinish, setTransferFinish] = useState('')

  // Post-transfer
  const [briteTempPost, setBriteTempPost] = useState('')
  const [britePressure, setBritePressure] = useState('')
  const [initialCarb, setInitialCarb] = useState(false)
  const [fvCoolingOff, setFvCoolingOff] = useState(false)

  const [isPending, startTransition] = useTransition()

  const loss = brew.volume_l - (parseFloat(volumeOut) || 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const vol = parseFloat(volumeOut)
    if (!destTankId || isNaN(vol) || vol <= 0) return
    startTransition(async () => {
      await transferBrew({
        brew_id: brew.id,
        source_tank_id: sourceTank.id,
        dest_tank_id: destTankId,
        volume_in_l: brew.volume_l,
        volume_out_l: vol,
        batch_code: batchCode.trim() || null,
        notes,
        // Transfer report
        brite_cooling_on: briteCoolingOn,
        fv_temp_pre_c: fvTempPre ? parseFloat(fvTempPre) : null,
        brite_temp_pre_c: briteTempPre ? parseFloat(briteTempPre) : null,
        purge_start: purgeStart || null,
        purge_finish: purgeFinish || null,
        transfer_start: transferStart || null,
        transfer_finish: transferFinish || null,
        brite_temp_post_c: briteTempPost ? parseFloat(briteTempPost) : null,
        brite_pressure_psi: britePressure ? parseFloat(britePressure) : null,
        initial_carb_performed: initialCarb,
        fv_cooling_off: fvCoolingOff,
      })
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Transfer</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {brew.beer_name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            {/* Source → Dest */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-2 rounded-lg flex-shrink-0">
                {sourceTank.name}
              </span>
              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              {available.length === 0 ? (
                <span className="text-sm text-red-500">No empty tanks available</span>
              ) : (
                <select
                  value={destTankId}
                  onChange={e => setDestTankId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  required
                >
                  {available.map(t => (
                    <option key={t.tank.id} value={t.tank.id}>{t.tank.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Volume */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Volume into destination (L)
                <span className="text-gray-400 font-normal ml-1">— was {brew.volume_l} L</span>
              </label>
              <input
                type="number"
                value={volumeOut}
                onChange={e => setVolumeOut(e.target.value)}
                step="1"
                min="1"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {loss > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Transfer loss: {loss.toFixed(0)} L ({((loss / brew.volume_l) * 100).toFixed(1)}%)
                </p>
              )}
            </div>

            {/* Batch code */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Batch code</label>
              <input
                type="text"
                value={batchCode}
                onChange={e => setBatchCode(e.target.value)}
                placeholder="e.g. 376"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* PRE-TRANSFER */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPreOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pre-Transfer</span>
              {preOpen
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {preOpen && (
              <div className="px-5 pb-4 space-y-3">
                <CheckRow label="Brite cooling on?" checked={briteCoolingOn} onChange={setBriteCoolingOn} />
                <div className="flex gap-3">
                  <TempInput label="FV temp" value={fvTempPre} onChange={setFvTempPre} />
                  <TempInput label="Brite temp" value={briteTempPre} onChange={setBriteTempPre} />
                </div>
                <div className="flex gap-3">
                  <TimeInput label="Purge start" value={purgeStart} onChange={setPurgeStart} />
                  <TimeInput label="Purge finish" value={purgeFinish} onChange={setPurgeFinish} />
                </div>
                <div className="flex gap-3">
                  <TimeInput label="Transfer start" value={transferStart} onChange={setTransferStart} />
                  <TimeInput label="Transfer finish" value={transferFinish} onChange={setTransferFinish} />
                </div>
              </div>
            )}
          </div>

          {/* POST-TRANSFER */}
          <div className="border-t border-gray-100">
            <button
              type="button"
              onClick={() => setPostOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-3 text-left"
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Post-Transfer</span>
              {postOpen
                ? <ChevronUp className="h-4 w-4 text-gray-400" />
                : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </button>
            {postOpen && (
              <div className="px-5 pb-4 space-y-3">
                <div className="flex gap-3">
                  <TempInput label="Brite temp" value={briteTempPost} onChange={setBriteTempPost} />
                  <TempInput label="Brite pressure" value={britePressure} onChange={setBritePressure} unit="psi" />
                </div>
                <CheckRow label="Initial carb performed?" checked={initialCarb} onChange={setInitialCarb} />
                <CheckRow label="FV cooling off?" checked={fvCoolingOff} onChange={setFvCoolingOff} />
              </div>
            )}
          </div>

          {/* Notes + submit */}
          <div className="p-5 pt-3 space-y-4 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Gas arm left open — potential O₂ exposure"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || available.length === 0}
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isPending ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
