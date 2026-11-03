import { daysBetweenISO } from '@/lib/dates'
import { isRtd } from '@/lib/rtd'
import { inProduction } from '@/lib/stage-style'

// Cold break comes off the day after brew day. A Friday brew is not looked at
// until Monday, so the flag holds for three days, then lets go rather than
// nagging about a beer that is well into its ferment.
const LAST_DAY = 3

type ColdBreakBrew = { brew_day: string; stage: string; og_plato: number | null; beer_name: string; style: string | null }

/** True while a beer is at the point where its cold break should come off. A lemonade has none. */
export function inColdBreakWindow(brew: ColdBreakBrew, today: string): boolean {
  if (brew.stage !== 'active_ferment' || inProduction(brew) || isRtd(brew.beer_name, brew.style)) return false
  const days = daysBetweenISO(brew.brew_day.slice(0, 10), today)
  return days >= 1 && days <= LAST_DAY
}

/**
 * A tank log line that says it has been dealt with. Brewers often take the
 * litres off without a note, and a bare "Removed 10 L, now 1190 L" this early is
 * the cold break. One noted as anything else, like a sample, is not.
 */
export function closesColdBreak(note: string | null): boolean {
  if (!note) return false
  return /cold\s*break/i.test(note) || /^Removed [\d.]+ L, now [\d.]+ L$/.test(note.trim())
}
