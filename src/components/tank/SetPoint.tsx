'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { setTankTarget } from '@/app/tanks/actions'

interface Target {
  tankId: string | null | undefined
  /** "FV2", "Hot Liquor" */
  name: string
  temperature: number | null | undefined
  setPoint: number | null | undefined
}

// Frigid reports 200 for a vessel with its cooling switched off
const isOn = (sp: number | null | undefined): sp is number => sp != null && sp !== 200

/**
 * Wraps a temperature so that tapping it opens the set point for that vessel.
 * Used everywhere a temperature is shown, so the gesture is the same on every
 * screen. With no controller attached it renders the temperature as plain text.
 */
export function TempTap({ tankId, name, temperature, setPoint, className = '', children }: Target & {
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  if (!tankId) return <span className={className}>{children}</span>
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={`Change the set point for ${name}`}
        className={`text-left cursor-pointer rounded-md decoration-dotted decoration-black/25 underline-offset-4 hover:underline active:opacity-60 ${className}`}
      >
        {children}
      </button>
      {open && <SetPointDialog tankId={tankId} name={name} temperature={temperature} setPoint={setPoint} onClose={() => setOpen(false)} />}
    </>
  )
}

function SetPointDialog({ tankId, name, temperature, setPoint, onClose }: Target & { tankId: string; onClose: () => void }) {
  const router = useRouter()
  const [value, setValue] = useState(isOn(setPoint) ? String(setPoint) : '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // A mouse or trackpad means a real keyboard, so start in the box ready to type
  const [typing] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches)

  const parsed = value.trim() === '' ? NaN : Number(value.replace(',', '.').replace('−', '-'))
  const valid = Number.isFinite(parsed)
  const unchanged = valid && isOn(setPoint) && parsed === setPoint

  const nudge = (by: number) => {
    const from = valid ? parsed : isOn(setPoint) ? setPoint : temperature ?? 0
    setValue(String(Math.round((from + by) * 10) / 10))
    setError(null)
  }

  // Pressing a button normally moves focus to it. Cancelling that on pointer-down
  // leaves focus (and the phone keyboard, open or closed) exactly as it was.
  const keepFocus = (e: React.PointerEvent) => e.preventDefault()

  const flipSign = () => {
    setValue((v) => (/^[-−]/.test(v.trim()) ? v.trim().slice(1) : `-${v.trim()}`))
    setError(null)
  }

  function send() {
    if (!valid || isPending) return
    setError(null)
    startTransition(async () => {
      let res
      try {
        res = await setTankTarget(tankId, parsed)
      } catch {
        setError('Could not reach the app. Nothing was changed.')
        return
      }
      if (!res.success) { setError(res.message); return }
      toast.success(`${name} set to ${parsed}°C`)
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/50 px-4 pt-[12vh] sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name} set point`}>
      <div className="w-full max-w-sm sm:max-w-xs bg-white rounded-2xl shadow-xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{name} set point</h2>
          <p className="text-sm text-gray-500 mt-0.5 tabular-nums">
            Now {temperature != null ? `${temperature.toFixed(1)}°C` : 'unknown'}
            {' · '}
            {isOn(setPoint) ? `set to ${setPoint.toFixed(1)}°C` : 'no set point'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onPointerDown={keepFocus} onClick={() => nudge(-0.5)} aria-label="Down half a degree"
            className="h-14 w-14 flex-shrink-0 rounded-xl border border-gray-200 text-gray-700 flex items-center justify-center active:bg-gray-100">
            <Minus className="h-5 w-5" />
          </button>
          <div className="relative flex-1">
            {/* The phone number pad has no minus key, and chill set points are
                negative, so the sign has its own button inside the field. */}
            <button type="button" onPointerDown={keepFocus} onClick={flipSign} aria-label="Switch between above and below zero"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 h-11 w-10 rounded-lg bg-black/[0.05] text-lg font-semibold text-gray-700 active:bg-black/10">
              ±
            </button>
            <input
              value={value}
              onChange={(e) => { setValue(e.target.value.replace(/[^0-9.,\-−]/g, '')); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') onClose() }}
              inputMode="decimal"
              autoComplete="off"
              autoFocus={typing}
              aria-label="New set point in degrees Celsius"
              className="w-full h-14 rounded-xl border border-gray-200 pl-12 pr-9 text-center text-2xl font-semibold tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">°C</span>
          </div>
          <button type="button" onPointerDown={keepFocus} onClick={() => nudge(0.5)} aria-label="Up half a degree"
            className="h-14 w-14 flex-shrink-0 rounded-xl border border-gray-200 text-gray-700 flex items-center justify-center active:bg-gray-100">
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="h-12 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
          <button type="button" onClick={send} disabled={!valid || unchanged || isPending}
            className="flex-1 h-12 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? 'Sending to Frigid…' : valid ? `Set ${name} to ${parsed}°C` : 'Enter a temperature'}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 text-center">Use − and + to step by half a degree, or tap the number to type. This changes the real controller straight away.</p>
      </div>
    </div>
  )
}
