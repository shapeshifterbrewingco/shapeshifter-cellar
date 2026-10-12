'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { quickLogReading } from '@/app/brews/actions'
import type { TankDashboardData } from '@/types'

// "4,3" from a European keypad is still 4.3
const parse = (s: string) => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/**
 * The phone's front door: pick a tank, type what the sample says, save.
 * The time and who logged it are stamped on the server. Everything else about
 * a brew lives on the tank card further down.
 */
export function QuickLog({ tanks }: { tanks: TankDashboardData[] }) {
  const live = tanks.filter((t) => t.brew && t.brew.stage !== 'empty')
  const [tankId, setTankId] = useState<string | null>(live.length === 1 ? live[0].tank.id : null)
  const [gravity, setGravity] = useState('')
  const [ph, setPh] = useState('')
  const [temp, setTemp] = useState('')
  const [isPending, startTransition] = useTransition()

  if (live.length === 0) return null

  const selected = live.find((t) => t.tank.id === tankId) ?? null
  const hasValue = !!(gravity.trim() || ph.trim() || temp.trim())

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!selected?.brew || isPending) return
    const plato = parse(gravity), phN = parse(ph), tempN = parse(temp)
    if ([plato, phN, tempN].some((v) => Number.isNaN(v))) { toast.error('One of those is not a number.'); return }
    startTransition(async () => {
      let result
      try {
        result = await quickLogReading({
          brew_id: selected.brew!.id, tank_id: selected.tank.id,
          plato, ph: phN, temperature_c: tempN,
        })
      } catch {
        toast.error('Not saved. Check the connection and try again.')
        return
      }
      if (!result.ok) { toast.error(result.message); return }
      toast.success(`${selected.tank.name} logged`)
      setGravity(''); setPh(''); setTemp('')
      setTankId(live.length === 1 ? live[0].tank.id : null)
    })
  }

  const last = selected?.latest_gravity
  const field = 'w-full h-14 rounded-xl border border-gray-200 bg-white px-3 text-center text-xl font-semibold tabular-nums text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'

  return (
    <form onSubmit={save} className="md:hidden bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
      <h2 className="text-base font-bold text-gray-900">Quick log</h2>

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

      <div className="grid grid-cols-3 gap-2 mt-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1 text-center">Gravity °P</span>
          <input inputMode="decimal" enterKeyHint="next" autoComplete="off" value={gravity} onChange={(e) => setGravity(e.target.value)}
            placeholder={last?.plato != null ? String(last.plato) : '-'} className={field} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1 text-center">pH</span>
          <input inputMode="decimal" enterKeyHint="next" autoComplete="off" value={ph} onChange={(e) => setPh(e.target.value)}
            placeholder={last?.ph != null ? String(last.ph) : '-'} className={field} />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-500 mb-1 text-center">Temp °C</span>
          <input inputMode="decimal" enterKeyHint="done" autoComplete="off" value={temp} onChange={(e) => setTemp(e.target.value)}
            placeholder={selected?.temperature != null ? selected.temperature.toFixed(1) : '-'} className={field} />
        </label>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5 text-center">
        {selected ? 'Grey numbers are the last reading and the tank probe. Fill in what you measured.' : 'Pick a tank first.'}
      </p>

      <button
        type="submit"
        disabled={!selected || !hasValue || isPending}
        className="mt-3 w-full h-14 rounded-xl bg-primary text-white text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
        {selected ? `Save ${selected.tank.name}` : 'Save'}
      </button>
    </form>
  )
}
