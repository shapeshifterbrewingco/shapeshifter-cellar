'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setWeekStart, setBirthday } from './actions'
import type { WeekStart } from './actions'
import { ThemeChoice } from '@/components/layout/Theme'

/** Settings that follow the person, not the brewery. Each one saves as soon as it is changed. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const SELECT = 'border border-gray-200 rounded-xl px-2.5 py-2 text-base sm:text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30'

export function MyPreferences({ weekStart, birthday, name }: { weekStart: WeekStart; birthday: string | null; name: string }) {
  const [day, setDay] = useState<WeekStart>(weekStart)
  const [bMonth, setBMonth] = useState(birthday ? birthday.slice(0, 2) : '')
  const [bDay, setBDay] = useState(birthday ? birthday.slice(3, 5) : '')

  function saveBirthday(month: string, dayOfMonth: string) {
    setBMonth(month); setBDay(dayOfMonth)
    // Saved once both halves are picked, or cleared when both are emptied
    if (!!month !== !!dayOfMonth) return
    const value = month ? `${month}-${dayOfMonth}` : null
    startTransition(async () => {
      const res = await setBirthday(value).catch(() => ({ ok: false, message: 'Could not reach the app.' }))
      if (!res.ok) toast.error(`Not saved. ${res.message ?? ''}`.trim())
      else toast.success(value ? 'Birthday saved' : 'Birthday removed')
    })
  }
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
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Week starts on</p>
          <p className="text-xs text-gray-400">First column of the Planner calendar</p>
        </div>
        <div className="flex flex-shrink-0 rounded-xl border border-gray-200 overflow-hidden">
          {([[0, 'Sunday'], [1, 'Monday']] as [WeekStart, string][]).map(([v, label]) => (
            <button key={v} type="button" onClick={() => choose(v)} aria-pressed={day === v}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${day === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-4 pt-4 border-t border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">Birthday</p>
          <p className="text-xs text-gray-400">So the app can say happy birthday. No year needed</p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <select aria-label="Birthday day" value={bDay} onChange={(e) => saveBirthday(bMonth, e.target.value)} className={SELECT}>
            <option value="">Day</option>
            {Array.from({ length: bMonth ? DAYS_IN[Number(bMonth) - 1] : 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => (
              <option key={d} value={d}>{Number(d)}</option>
            ))}
          </select>
          <select aria-label="Birthday month" value={bMonth} onChange={(e) => saveBirthday(e.target.value, bDay)} className={SELECT}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 mt-4 pt-4 border-t border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-900">Appearance</p>
          <p className="text-xs text-gray-400">Remembered on this device only</p>
        </div>
        <ThemeChoice />
      </div>
    </div>
  )
}
