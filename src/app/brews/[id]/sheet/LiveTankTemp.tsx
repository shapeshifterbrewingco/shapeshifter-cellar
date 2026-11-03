'use client'

import { useEffect, useState } from 'react'
import { FRIGID_OFF_SET_POINT } from '@/lib/frigid'

const POLL_MS = 20_000
// A tank whose temperature is moving reports about every minute. Past this the
// number may no longer be what is in the tank, so it says so.
const OLD_AFTER_MS = 5 * 60_000

type Reading = { temperature: number; setPoint: number | null; readAt: string | null }

function ageText(ms: number) {
  const mins = Math.floor(Math.max(0, ms) / 60_000)
  if (mins < 1) return 'Under a minute ago'
  return mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} hr ago`
}

/**
 * What the tank's probe says, pinned to the top of the brew sheet during the
 * day so knock out does not mean switching to Frigid. A dropped request keeps
 * the last reading on screen and lets its age grow, rather than blanking it.
 */
export function LiveTankTemp({ tankId, tankName }: { tankId: string; tankName: string }) {
  const [reading, setReading] = useState<Reading | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch(`/api/tank-temp?tank=${encodeURIComponent(tankId)}`, { cache: 'no-store' })
        const body = res.ok ? await res.json() : null
        if (alive && body?.temperature != null) setReading(body)
      } catch {
        // Brewery wifi. The next poll will have it.
      }
      if (alive) setNow(Date.now())
    }
    void poll()
    const timer = setInterval(poll, POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      alive = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [tankId])

  const age = reading?.readAt ? now - Date.parse(reading.readAt) : null
  const old = age != null && age > OLD_AFTER_MS
  const setPoint = reading?.setPoint == null ? ''
    : reading.setPoint === FRIGID_OFF_SET_POINT ? 'Cooling off'
    : `Set to ${reading.setPoint}°C`

  return (
    <div className="sticky top-16 md:top-2 z-20 rounded-2xl bg-white ring-1 ring-black/5 shadow-md px-4 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-wide text-gray-400">{tankName} NOW</p>
        <p className="text-2xl font-bold tracking-tight tabular-nums text-gray-900 leading-tight">{reading ? `${reading.temperature.toFixed(1)}°C` : '-'}</p>
      </div>
      <div className="text-right text-xs min-w-0">
        {setPoint && <p className="text-gray-600">{setPoint}</p>}
        <p className={old ? 'font-semibold text-malt-dark' : 'text-gray-400'}>
          {!reading ? (now ? 'No reading from Frigid' : 'Reading the probe…') : age == null ? '' : `${old ? 'Last reading ' : ''}${ageText(age)}`}
        </p>
      </div>
    </div>
  )
}
