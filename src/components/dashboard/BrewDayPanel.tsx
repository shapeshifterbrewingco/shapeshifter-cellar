'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ClipboardList } from 'lucide-react'

export interface OpenBrewDay {
  id: string
  beer: string
  tank: string
  filled: number
  total: number
  /** What "All in FV" still needs before the day is finished */
  missing: string[]
  /** The next few lines not yet ticked off, in sheet order */
  next: string[]
}

const OPEN_KEY = 'brewday:open'

/**
 * Sits above everything else on the Cellar page while a brew day is running,
 * so the sheet is one tap away every time the app is opened that day.
 */
export function BrewDayPanel({ days }: { days: OpenBrewDay[] }) {
  // Open or folded away is the brewer's choice, and the device remembers it
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

  if (days.length === 0) return null

  return (
    <section className="md:hidden bg-white rounded-2xl ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] overflow-hidden mb-3">
      <button type="button" onClick={toggle} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 bg-malt text-white px-4 py-3.5 text-left active:opacity-90">
        <span className="min-w-0">
          <span className="block text-base font-semibold">Brew day</span>
          {!open && <span className="block text-xs text-white/85 truncate">{days.map((d) => `${d.beer} in ${d.tank}`).join(' · ')}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 flex-shrink-0 text-white/85 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className="divide-y divide-gray-100">
          {days.map((d) => {
            const pct = d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0
            return (
              <li key={d.id} className="px-4 py-3.5">
                <p className="text-[11px] font-semibold tracking-wide text-gray-400">{d.tank}</p>
                <p className="text-[17px] font-semibold leading-snug text-gray-900 break-words">{d.beer}</p>

                <div className="mt-2.5 h-2 rounded-full bg-malt/15 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Brew sheet filled in">
                  <div className="h-full rounded-full bg-malt transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-gray-500 tabular-nums">
                  {d.total > 0 ? `${d.filled} of ${d.total} filled in` : 'Nothing filled in yet'}
                </p>

                {d.next.length > 0 && (
                  <p className="mt-2 text-sm text-gray-700"><span className="text-gray-400">Next </span>{d.next.join(', ')}</p>
                )}
                <p className="mt-1 text-sm text-gray-700">
                  <span className="text-gray-400">To finish the day </span>
                  {d.missing.length > 0 ? `${d.missing.join(', ')} at the end of the sheet, then tap Finish brew day` : 'tap Finish brew day on the sheet'}
                </p>

                <Link href={`/brews/${d.id}/sheet`}
                  className="mt-3 w-full h-12 rounded-xl bg-malt text-white text-base font-semibold inline-flex items-center justify-center gap-2 active:opacity-90">
                  <ClipboardList className="h-5 w-5" />Open brew sheet
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The desktop version: one slim line per brew day, under the greeting, so the tanks stay where they are. */
export function BrewDayBar({ days }: { days: OpenBrewDay[] }) {
  if (days.length === 0) return null
  return (
    <div className="hidden md:block mb-3 space-y-2">
      {days.map((d) => {
        const pct = d.total > 0 ? Math.round((d.filled / d.total) * 100) : 0
        return (
          <Link key={d.id} href={`/brews/${d.id}/sheet`}
            className="flex items-center gap-4 rounded-2xl bg-malt px-5 py-3 text-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:opacity-95">
            <span className="flex-shrink-0 text-sm font-semibold whitespace-nowrap">Brew day · {d.tank} · {d.beer}</span>
            <span className="flex-shrink-0 flex items-center gap-2">
              <span className="block h-1.5 w-28 rounded-full bg-white/30 overflow-hidden"><span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} /></span>
              <span className="text-xs text-white/85 tabular-nums whitespace-nowrap">{d.filled} of {d.total}</span>
            </span>
            <span className="flex-1 min-w-0 text-sm text-white/90 truncate">
              {d.next.length > 0 ? `Next: ${d.next.join(', ')}` : d.missing.length > 0 ? `To finish: ${d.missing.join(', ')}` : 'Ready to finish'}
            </span>
            <span className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold whitespace-nowrap">
              <ClipboardList className="h-4 w-4" />Open brew sheet
            </span>
          </Link>
        )
      })}
    </div>
  )
}
