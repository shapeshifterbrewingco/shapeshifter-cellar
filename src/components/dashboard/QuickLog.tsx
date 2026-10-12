'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { quickLogReading } from '@/app/brews/actions'
import type { TankDashboardData } from '@/types'

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
export function QuickLog({ tanks }: { tanks: TankDashboardData[] }) {
  const live = tanks.filter((t) => t.brew && t.brew.stage !== 'empty')
  const [tankId, setTankId] = useState<string | null>(live.length === 1 ? live[0].tank.id : null)
  const [gravity, setGravity] = useState('')
  const [ph, setPh] = useState('')
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
  const hasValue = !!(gravity.trim() || ph.trim())

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!selected?.brew || isPending) return
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

  const last = selected?.latest_gravity
  const field = 'w-full h-14 rounded-xl border border-gray-200 bg-white px-3 text-center text-xl font-semibold tabular-nums text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'

  return (
    <form onSubmit={save} className="md:hidden bg-white rounded-2xl ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] px-4 py-3.5 mb-3">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center justify-between -my-1 py-1 text-left">
        <span className="text-base font-bold text-gray-900">Quick log</span>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && <>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {live.map((t) => {
          const on = t.tank.id === tankId
          return (
            <button
              key={t.tank.id}
              type="button"
              onClick={() => setTankId(t.tank.id)}
              aria-pressed={on}
              className={`min-h-14 rounded-xl border px-2 py-2 text-left transition-colors ${
                on ? 'bg-primary border-primary text-white' : 'bg-gray-50 border-gray-200 text-gray-900 active:bg-gray-100'
              }`}
            >
              <span className="block text-sm font-bold leading-tight">{t.tank.name}</span>
              <span className={`block text-[11px] leading-tight truncate ${on ? 'text-white/80' : 'text-gray-500'}`}>{t.brew!.beer_name}</span>
            </button>
          )
        })}
      </div>

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

      <button
        type="submit"
        disabled={!selected || !hasValue || isPending}
        className="mt-3 w-full h-14 rounded-xl bg-primary text-white text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        {selected ? `Save ${selected.tank.name}` : 'Save'}
      </button>
      </>}
    </form>
  )
}
