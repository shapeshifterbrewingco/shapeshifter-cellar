'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { X, ArrowRight, Loader2, Check, RefreshCw, Snowflake, Power } from 'lucide-react'
import { transferBrew } from '@/app/brews/actions'
import { readTankTemps, setTankTarget, turnCoolingOff } from '@/app/tanks/actions'
import type { Brew, Tank, TankDashboardData } from '@/types'

interface Props {
  brew: Brew
  sourceTank: Tank
  allTanks: TankDashboardData[]
  onClose: () => void
}

/** What a brite is set to before beer goes in. */
const BRITE_SET_C = '2'

// A transfer takes an hour or more and the form is filled in along the way, so
// it is kept on the device until the transfer is saved. Closing it loses nothing.
interface Draft {
  destTankId: string
  batchCode: string
  notes: string
  briteSet: string
  /** Tank the brite set point was sent to, and what it was. Empty until done. */
  briteSetDone: string
  fvTempPre: string
  briteTempPre: string
  preReadAt: string
  purgeStart: string
  purgeFinish: string
  transferStart: string
  transferFinish: string
  briteTempPost: string
  postReadAt: string
  britePressure: string
  briteVolume: string
  initialCarb: boolean
  fvCoolingOff: boolean
}

const draftKey = (brewId: string) => `transfer-draft-${brewId}`

// A draft from yesterday describes a brite set point that may no longer be true
const DRAFT_HOURS = 18

function loadDraft(brewId: string): Partial<Draft> {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey(brewId)) ?? '{}') as { at?: number; f?: Partial<Draft> }
    return saved.f && saved.at && Date.now() - saved.at < DRAFT_HOURS * 3_600_000 ? saved.f : {}
  } catch { return {} }
}

const clock = () => new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

const LABEL = 'block text-[11px] font-medium text-gray-500 mb-1'
const INPUT = 'w-full h-10 border border-gray-200 rounded-lg px-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30'
const ACTION = 'inline-flex items-center justify-center gap-1.5 h-10 px-3 rounded-lg text-sm font-semibold whitespace-nowrap disabled:opacity-50'
const SECTION = 'text-[11px] font-medium text-gray-400 uppercase tracking-wide'

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between">
        <label className={LABEL}>{label}</label>
        <button type="button" onClick={() => onChange(nowHHMM())} className="text-[11px] font-semibold text-primary">Now</button>
      </div>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </div>
  )
}

function TempInput({ label, value, onChange, unit = '°C' }: { label: string; value: string; onChange: (v: string) => void; unit?: string }) {
  return (
    <div className="flex-1 min-w-0">
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input type="text" inputMode="decimal" autoComplete="off" value={value} placeholder="-"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.-]/g, ''))} className={`${INPUT} pr-8`} />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>
      </div>
    </div>
  )
}

const Done = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-1.5 text-sm font-medium text-hops"><Check className="h-4 w-4 flex-shrink-0" />{children}</p>
)

export function TransferModal({ brew, sourceTank, allTanks, onClose }: Props) {
  const available = allTanks.filter((t) => t.tank.id !== sourceTank.id && (!t.brew || t.brew.stage === 'empty'))
  // Beer nearly always goes to BBT A; failing that any brite, then whatever is empty
  const preferred =
    available.find((t) => /^(bbt|brite)\s*a$/i.test(t.tank.name)) ??
    available.find((t) => /bbt|brite/i.test(t.tank.name)) ??
    available[0]

  const [f, setF] = useState<Draft>(() => {
    const saved = typeof window === 'undefined' ? {} : loadDraft(brew.id)
    const base: Draft = {
      destTankId: preferred?.tank.id ?? '', batchCode: brew.batch_code ?? '', notes: '',
      briteSet: BRITE_SET_C, briteSetDone: '', fvTempPre: '', briteTempPre: '', preReadAt: '',
      purgeStart: '', purgeFinish: '', transferStart: '', transferFinish: '',
      briteTempPost: '', postReadAt: '', britePressure: '', briteVolume: '', initialCarb: false, fvCoolingOff: false,
    }
    const merged = { ...base, ...saved }
    // A saved destination that has since been filled is no use
    if (!available.some((t) => t.tank.id === merged.destTankId)) { merged.destTankId = base.destTankId; merged.briteSetDone = '' }
    return merged
  })
  const set = (patch: Partial<Draft>) => setF((d) => ({ ...d, ...patch }))

  useEffect(() => {
    try { localStorage.setItem(draftKey(brew.id), JSON.stringify({ at: Date.now(), f })) } catch { /* private mode: the form still works */ }
  }, [f, brew.id])

  const dest = available.find((t) => t.tank.id === f.destTankId)?.tank
  const briteIsSet = !!dest && f.briteSetDone.startsWith(`${dest.id}|`)
  const briteSetTo = briteIsSet ? f.briteSetDone.split('|')[1] : ''

  const [busy, setBusy] = useState<'set' | 'pre' | 'post' | 'off' | null>(null)
  const [isPending, startTransition] = useTransition()

  const readPre = useCallback(async (destId: string, quiet = false) => {
    setBusy('pre')
    const temps = await readTankTemps([sourceTank.id, destId].filter(Boolean))
    setBusy(null)
    const fv = temps[sourceTank.id], brite = destId ? temps[destId] : null
    if (fv == null && brite == null) { if (!quiet) toast.error('No reading from Frigid. Type the temperatures in.'); return }
    setF((d) => ({ ...d, ...(fv != null ? { fvTempPre: String(fv) } : {}), ...(brite != null ? { briteTempPre: String(brite) } : {}), preReadAt: clock() }))
  }, [sourceTank.id])

  // Read both tanks as the form opens, unless a reading is already on it
  useEffect(() => {
    if (f.preReadAt || f.fvTempPre || f.briteTempPre || !f.destTankId) return
    const id = setTimeout(() => { void readPre(f.destTankId, true) }, 0)
    return () => clearTimeout(id)
    // Only on open: after that the brewer decides when to read again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setBrite() {
    if (!dest) return
    const temp = parseFloat(f.briteSet)
    if (!Number.isFinite(temp)) { toast.error('Enter a temperature for the brite.'); return }
    setBusy('set')
    const res = await setTankTarget(dest.id, temp)
    setBusy(null)
    if (!res.success) { toast.error(res.message); return }
    set({ briteSetDone: `${dest.id}|${temp}` })
  }

  async function readPost() {
    if (!dest) return
    setBusy('post')
    const temps = await readTankTemps([dest.id])
    setBusy(null)
    if (temps[dest.id] == null) { toast.error('No reading from Frigid. Type it in.'); return }
    set({ briteTempPost: String(temps[dest.id]), postReadAt: clock() })
  }

  async function fvOff() {
    setBusy('off')
    const res = await turnCoolingOff(sourceTank.id)
    setBusy(null)
    if (!res.success) { toast.error(res.message); return }
    set({ fvCoolingOff: true })
  }

  const num = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : null)

  const arrived = num(f.briteVolume)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dest || !briteIsSet) return
    startTransition(async () => {
      const result = await transferBrew({
        brew_id: brew.id,
        source_tank_id: sourceTank.id,
        dest_tank_id: dest.id,
        volume_out_l: num(f.briteVolume),
        batch_code: f.batchCode.trim() || null,
        notes: f.notes,
        brite_cooling_on: true,
        fv_temp_pre_c: num(f.fvTempPre),
        brite_temp_pre_c: num(f.briteTempPre),
        purge_start: f.purgeStart || null,
        purge_finish: f.purgeFinish || null,
        transfer_start: f.transferStart || null,
        transfer_finish: f.transferFinish || null,
        brite_temp_post_c: num(f.briteTempPost),
        brite_pressure_psi: num(f.britePressure),
        initial_carb_performed: f.initialCarb,
        fv_cooling_off: f.fvCoolingOff,
      })
      if (!result.ok) { toast.error(result.message); return }
      try { localStorage.removeItem(draftKey(brew.id)) } catch { /* nothing to clear */ }
      toast.success(num(f.briteVolume) != null ? `${brew.beer_name} is in ${dest.name}.` : `${brew.beer_name} is in ${dest.name}. Tap its volume to set what arrived.`)
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Transfer</h2>
            <p className="text-xs text-gray-400 mt-0.5">{brew.beer_name}{brew.batch_code ? ` · ${brew.batch_code}` : ''}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-800 bg-gray-100 px-3 h-10 flex items-center rounded-lg flex-shrink-0">{sourceTank.name}</span>
              <ArrowRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              {available.length === 0 ? (
                <span className="text-sm text-red-500">No empty tanks available</span>
              ) : (
                <select value={f.destTankId} required aria-label="Destination tank"
                  onChange={(e) => { set({ destTankId: e.target.value, briteTempPre: '', preReadAt: '' }); void readPre(e.target.value, true) }}
                  className="flex-1 h-10 border border-gray-200 rounded-lg px-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {available.map((t) => <option key={t.tank.id} value={t.tank.id}>{t.tank.name}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className={LABEL}>Batch code</label>
              <input type="text" value={f.batchCode} onChange={(e) => set({ batchCode: e.target.value })} placeholder="e.g. 376" className={INPUT} />
            </div>
          </div>

          {/* Before */}
          <div className="border-t border-gray-100 px-5 py-4 space-y-4">
            <p className={SECTION}>Before the transfer</p>

            <div>
              <label className={LABEL}>{dest?.name ?? 'Brite'} set point</label>
              <div className="flex items-center gap-2">
                <div className="relative w-24 flex-shrink-0">
                  <input type="text" inputMode="decimal" autoComplete="off" value={f.briteSet} aria-label="Brite set point"
                    onChange={(e) => set({ briteSet: e.target.value.replace(/[^0-9.-]/g, ''), briteSetDone: '' })} className={`${INPUT} pr-8`} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">°C</span>
                </div>
                <button type="button" onClick={setBrite} disabled={!dest || busy === 'set'}
                  className={`${ACTION} flex-1 ${briteIsSet ? 'bg-black/[0.04] text-gray-700' : 'bg-primary text-primary-foreground'}`}>
                  {busy === 'set' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Snowflake className="h-4 w-4" />}
                  {briteIsSet ? 'Set again' : 'Set brite temp'}
                </button>
              </div>
              <div className="mt-1.5 min-h-5">
                {briteIsSet
                  ? <Done>{dest!.name} set to {briteSetTo}°C</Done>
                  : <p className="text-xs text-malt-dark">Do this first. The transfer cannot be saved until the brite is set.</p>}
              </div>
            </div>

            <div>
              <div className="flex gap-3">
                <TempInput label={`${sourceTank.name} temp`} value={f.fvTempPre} onChange={(v) => set({ fvTempPre: v })} />
                <TempInput label={`${dest?.name ?? 'Brite'} temp`} value={f.briteTempPre} onChange={(v) => set({ briteTempPre: v })} />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 min-h-8">
                {f.preReadAt ? <Done>Read from the tanks at {f.preReadAt}</Done> : <p className="text-xs text-gray-400">Not read yet</p>}
                <button type="button" onClick={() => readPre(f.destTankId)} disabled={busy === 'pre'} className="inline-flex items-center gap-1 h-8 px-1 text-sm font-semibold text-primary disabled:opacity-50">
                  {busy === 'pre' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Record now
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <TimeInput label="Purge start" value={f.purgeStart} onChange={(v) => set({ purgeStart: v })} />
              <TimeInput label="Purge finish" value={f.purgeFinish} onChange={(v) => set({ purgeFinish: v })} />
            </div>
            <div className="flex gap-3">
              <TimeInput label="Transfer start" value={f.transferStart} onChange={(v) => set({ transferStart: v })} />
              <TimeInput label="Transfer finish" value={f.transferFinish} onChange={(v) => set({ transferFinish: v })} />
            </div>
          </div>

          {/* After */}
          <div className="border-t border-gray-100 px-5 py-4 space-y-4">
            <p className={SECTION}>After the transfer</p>

            <div>
              <div className="flex gap-3">
                <TempInput label={`${dest?.name ?? 'Brite'} temp`} value={f.briteTempPost} onChange={(v) => set({ briteTempPost: v })} />
                <TempInput label="Brite pressure" value={f.britePressure} onChange={(v) => set({ britePressure: v })} unit="psi" />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 min-h-8">
                {f.postReadAt ? <Done>Brite read at {f.postReadAt}</Done> : <p className="text-xs text-gray-400">Not read yet</p>}
                <button type="button" onClick={readPost} disabled={!dest || busy === 'post'} className="inline-flex items-center gap-1 h-8 px-1 text-sm font-semibold text-primary disabled:opacity-50">
                  {busy === 'post' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Record now
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={f.initialCarb} onChange={(e) => set({ initialCarb: e.target.checked })} className="w-5 h-5 rounded border-gray-300 accent-primary" />
              <span className="text-sm text-gray-700">Initial carb performed</span>
            </label>

            <div>
              {f.fvCoolingOff ? <Done>{sourceTank.name} cooling is off</Done> : (
                <button type="button" onClick={fvOff} disabled={busy === 'off'} className={`${ACTION} w-full bg-black/[0.04] text-gray-900`}>
                  {busy === 'off' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Turn off {sourceTank.name} cooling
                </button>
              )}
            </div>
          </div>

          <div className="p-5 pt-4 space-y-4 border-t border-gray-100">
            <div>
              <label className={LABEL}>Notes (optional)</label>
              <input type="text" value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Gas arm left open" className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Volume in {dest?.name ?? 'the brite'}</label>
              <div className="relative">
                <input type="text" inputMode="decimal" autoComplete="off" value={f.briteVolume} placeholder={String(Math.round(brew.volume_l))}
                  onChange={(e) => set({ briteVolume: e.target.value.replace(/[^0-9.]/g, '') })} className={`${INPUT} h-12 text-xl font-bold pr-8`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">L</span>
              </div>
              <p className="mt-1 text-xs text-gray-500 tabular-nums">
                {arrived == null
                  ? `Was ${Math.round(brew.volume_l).toLocaleString('en-AU')} L in ${sourceTank.name}. Leave blank to carry that across and fix it later.`
                  : arrived > brew.volume_l
                  ? `That is more than the ${Math.round(brew.volume_l).toLocaleString('en-AU')} L that was in ${sourceTank.name}. Check the figure.`
                  : `${Math.round(brew.volume_l - arrived)} L lost in the transfer (${(((brew.volume_l - arrived) / brew.volume_l) * 100).toFixed(1)}%)`}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 h-11 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">Close</button>
              <button type="submit" disabled={isPending || !dest || !briteIsSet}
                className="flex-1 h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isPending ? 'Saving…' : !briteIsSet ? 'Set brite temp first' : 'Finish transfer'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
