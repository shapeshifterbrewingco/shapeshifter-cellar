'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Re-fetches the page on a timer and whenever the tab comes back into view, so
 * a wall-mounted iPad never shows a cellar that is hours old. It pauses while
 * the tab is hidden and while someone is typing in a form.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()

  useEffect(() => {
    const busy = () => {
      const el = document.activeElement
      return !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
    }
    const refresh = () => {
      if (document.visibilityState === 'visible' && !busy()) router.refresh()
    }
    const timer = setInterval(refresh, seconds * 1000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [router, seconds])

  return null
}
