'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setWeekStart } from './actions'
import type { WeekStart } from './actions'

/** Settings that follow the person, not the brewery. Each one saves as soon as it is changed. */
export function MyPreferences({ weekStart, name }: { weekStart: WeekStart; name: string }) {
  const [day, setDay] = useState<WeekStart>(weekStart)
  const [isPending, startTransition] = useTransition()

  function choose(next: WeekStart) {
    if (next === day || isPending) return
    const before = day
    setDay(next)
    startTransition(async () => {
      const res = await setWeekStart(next).catch(() => ({ ok: false, message: 'Could not reach the app.' }))
      if (!res.ok) { setDay(before); toast.error(`Not saved. ${res.message ?? ''}`.trim()) }
      else toast.success(`Your week now starts on ${next === 0 ? 'Sunday' : 'Monday'}`)
    })
  }

  return (
    <div className="max-w-xl mb-8 bg-white rounded-2xl px-5 py-4 ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <h2 className="text-base font-bold text-gray-900">Just for you{name ? `, ${name}` : ''}</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">These only change what you see. Everyone else keeps their own.</p>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Week starts on</p>
          <p className="text-xs text-gray-400">First column of the Planner calendar</p>
        </div>
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          {([[0, 'Sunday'], [1, 'Monday']] as [WeekStart, string][]).map(([v, label]) => (
            <button key={v} type="button" onClick={() => choose(v)} aria-pressed={day === v}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${day === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
