'use client'

import { useSyncExternalStore } from 'react'
import { ThemeProvider as NextThemes, useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

/** Light by default. Night mode is a per-device choice, remembered by the browser. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  )
}

// The theme is only known in the browser. Until then, render as light.
const subscribe = () => () => {}
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false)

/** Moon / sun switch for the menu. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = useMounted() && resolvedTheme === 'dark'
  return (
    <button type="button" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-pressed={dark} className={className}>
      {dark ? <Sun className="h-5 w-5 flex-shrink-0" /> : <Moon className="h-5 w-5 flex-shrink-0" />}
      {dark ? 'Day mode' : 'Night mode'}
    </button>
  )
}

/** Light / Dark / Match device, for the Settings page. */
export function ThemeChoice() {
  const { theme, setTheme } = useTheme()
  const current = useMounted() ? theme ?? 'light' : 'light'
  return (
    <div className="flex flex-shrink-0 rounded-xl border border-gray-200 overflow-hidden">
      {([['light', 'Day'], ['dark', 'Night'], ['system', 'Match device']] as const).map(([v, label]) => (
        <button key={v} type="button" onClick={() => setTheme(v)} aria-pressed={current === v}
          className={`px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${current === v ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
