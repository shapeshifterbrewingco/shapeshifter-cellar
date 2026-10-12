'use client'

import { useSyncExternalStore } from 'react'
import { easterEgg } from '@/lib/greeting'

// Rolled once per app open and kept while it stays open, so the line does not
// change under you on the minute refresh. Quit and reopen, and it rolls again.
let rolled: string | null | undefined
const roll = (name: string) => (rolled === undefined ? (rolled = easterEgg(name)) : rolled)
const subscribe = () => () => {}

/**
 * The greeting line. Usually the standard one worked out on the server. Now
 * and then, an easter egg instead.
 */
export function Hello({ text, name, special }: { text: string; name: string; special?: boolean }) {
  const egg = useSyncExternalStore(subscribe, () => roll(name), () => null)
  // Birthdays and Christmas are never bumped by a joke
  return <>{special ? text : egg ?? text}</>
}
