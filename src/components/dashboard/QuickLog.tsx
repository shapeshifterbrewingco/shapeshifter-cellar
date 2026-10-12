'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { quickLogReading, logVdkReading } from '@/app/brews/actions'
import { VDK_STYLE } from '@/lib/vdk'
import type { TankDashboardData, VdkResult } from '@/types'

const OPEN_KEY = 'cellar-quicklog-open'

// "4,3" from a European keypad is still 4.3
const parse = (s: string) => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/**
 * The phone's front door: pick a tank, type gravity and pH, save. The time,
 * who logged it and the tank's temperature (from its Frigid probe) are stamped
 * on the server. Everything else about a brew lives on the tank card below.
 */
const VDK_ORDER: VdkResult[] = ['high', 'medium', 'low', 'pass']

export function QuickLog({ tanks, currentUser }: { tanks: TankDashboardData[]; currentUser: string }) {
  // A beer on chill is finished fermenting: nothing left to log, so it stays off the list
  const live = tanks.filter((t) => t.brew && t.brew.stage !== 'empty' && t.brew.stage !== 'on_chill')
  const [tankId, setTankId] = useState<string | null>(live.length === 1 ? live[0].tank.id : null)
  const [gravity, setGravity] = useState('')
  const [ph, setPh] = useState('')
  const [vdk, setVdk] = useState<VdkResult | null>(null)
  const [isPending, startTransition] = useTransition()

  // Open or folded away is the brewer's choice, and the phone remembers it
  const [open, setOpen] = useState(true)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    try { if (localStorage.getItem(OPEN_KEY) === '0') setOpen(false) } catch { /* private mode */ }
  }, [])
  function toggle() {
    setOpen((was) => {
      try { localStorage.setItem(OPEN_KEY, was ? '0' : '1') } catch { /* private mode */ }
      return !was
    })
  }

  if (live.length === 0) return null

  const selected = live.find((t) => t.tank.id === tankId) ?? null
  // A beer on diacetyl rest is past gravity checks: what gets tested daily is VDK
  const vdkMode = selected?.brew?.stage === 'diacetyl_rest'
  const hasValue = vdkMode ? !!vdk : !!(gravity.trim() || ph.trim())

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!selected?.brew || isPending) return
    if (vdkMode) { saveVdk(); return }
    const plato = parse(gravity), phN = parse(ph)
    if ([plato, phN].some((v) => Number.isNaN(v))) { toast.error('One of those is not a number.'); return }
    startTransition(async () => {
      let result
      try {
        result = await quickLogReading({
          brew_id: selected.brew!.id, tank_id: selected.tank.id,
          plato, ph: phN,
        })
      } catch {
        toast.error('Not saved. Check the connection and try again.')
        return
      }
      if (!result.ok) { toast.error(result.message); return }
      toast.success(`${selected.tank.name} logged`)
      setGravity(''); setPh('')
      setTankId(live.length === 1 ? live[0].tank.id : null)
    })
  }

  function saveVdk() {
    if (!selected?.brew || !vdk) return
    const result = vdk
    const tank = selected.tank
    startTransition(async () => {
      try {
        await logVdkReading({ brew_id: selected.brew!.id, tank_id: tank.id, result, recorded_by: currentUser, notes: '' })
      } catch {
        toast.error('Not saved. Check the connection and try again.')
        return
      }
      toast.success(result === 'pass'
        ? `VDK pass logged. ${tank.name} can now go on chill from its card.`
        : `VDK ${VDK_STYLE[result].label.toLowerCase()} logged for ${tank.name}`)
      setVdk(null)
      setTankId(live.length === 1 ? live[0].tank.id : null)
    })
  }

  const last = selected?.latest_gravity
  const field = 'w-full h-14 rounded-xl border border-gray-200 bg-white px-3 text-center text-xl font-semibold tabular-nums text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'

  return (
    <form onSubmit={save} className="md:hidden bg-white rounded-2xl ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden mb-3">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center justify-between bg-primary text-white px-4 py-3.5 text-left active:opacity-90">
        <span className="text-base font-semibold">Quick log</span>
        <ChevronDown className={`h-5 w-5 text-white/80 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <div className="px-4 pb-4 pt-1">
      <div className="grid grid-cols-3 gap-2 mt-3">
        {live.map((t) => {
          const on = t.tank.id === tankId
          return (
            <button
              key={t.tank.id}
              type="button"
              onClick={() => { setTankId(t.tank.id); setVdk(null) }}
              aria-pressed={on}
              className={`min-h-14 rounded-xl border px-2 py-2 text-left transition-colors ${
                on ? 'bg-yeast border-yeast text-charcoal' : 'bg-background border-black/5 text-charcoal active:bg-black/5'
              }`}
            >
              <span className="block text-sm font-bold leading-tight">{t.tank.name}</span>
              <span className={`block text-[11px] leading-tight truncate ${on ? 'text-charcoal/70' : 'text-gray-500'}`}>{t.brew!.beer_name}</span>
            </button>
          )
        })}
      </div>

      {vdkMode ? (
        <>
          <p className="text-xs font-medium text-gray-500 mt-3 mb-1 text-center">VDK result</p>
          <div className="grid grid-cols-4 gap-2">
            {VDK_ORDER.map((r) => {
              const st = VDK_STYLE[r]
              const on = vdk === r
              return (
                <button key={r} type="button" onClick={() => setVdk(on ? null : r)} aria-pressed={on}
                  className={`h-14 rounded-xl border-2 text-base font-semibold transition-colors ${st.bg} ${st.text} ${on ? 'border-primary ring-2 ring-primary/30' : st.border}`}>
                  {st.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5 text-center">
            {selected!.tank.name} is on diacetyl rest, so this logs a VDK test.
            {selected!.latest_vdk ? ` Last result: ${VDK_STYLE[selected!.latest_vdk.result as VdkResult]?.label ?? selected!.latest_vdk.result}.` : ' None logged yet.'}
          </p>
        </>
      ) : (
        <>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1 text-center">Gravity °P</span>
            <input inputMode="decimal" enterKeyHint="next" autoComplete="off" value={gravity} onChange={(e) => setGravity(e.target.value)}
              placeholder={last?.plato != null ? String(last.plato) : '-'} className={field} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1 text-center">pH</span>
            <input inputMode="decimal" enterKeyHint="done" autoComplete="off" value={ph} onChange={(e) => setPh(e.target.value)}
              placeholder={last?.ph != null ? String(last.ph) : '-'} className={field} />
          </label>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 text-center">
          {!selected
            ? 'Pick a tank first.'
            : selected.temperature != null
              ? `Tank is at ${selected.temperature.toFixed(1)}°C. Temperature and time are recorded for you.`
              : 'No probe reading for this tank, so no temperature will be recorded.'}
        </p>
        </>
      )}

      <button
        type="submit"
        disabled={!selected || !hasValue || isPending}
        className="mt-3 w-full h-14 rounded-xl bg-primary text-white text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        {!selected ? 'Save' : vdkMode ? (vdk ? `Save ${selected.tank.name}: VDK ${VDK_STYLE[vdk].label.toLowerCase()}` : 'Pick a result') : `Save ${selected.tank.name}`}
      </button>
      </div>}
    </form>
  )
}
