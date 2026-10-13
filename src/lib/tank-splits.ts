// What each beer in tank is planned to be packed into, read from the Packaging
// Splits sheet (the same rows the Sales App and the planner use).

import { getPacks, brandOf, brandMatches } from '@/lib/planner/sales-app/splits'
import { adelaideNow, dayKey } from '@/lib/planner/google'
import { createServiceClient } from '@/lib/supabase/server'
import type { TankDashboardData } from '@/types'

export interface SheetSplit {
  /** Pack day, YYYY-MM-DD */
  date: string
  /** The row's name on the sheet, e.g. "Golden Ratio CARTONS" */
  label: string
  /** "109 × 24pk", "22 × 50 L", biggest pack first */
  parts: string[]
  proposed: boolean
}

type Pack = { date: Date; beer: string; key: string; qty: Record<string, number> }

const PART: [string, (n: number) => string][] = [
  ['24PK', (n) => `${n} × 24pk`], ['16PK', (n) => `${n} × 16pk`],
  ['50L', (n) => `${n} × 50 L`], ['30L', (n) => `${n} × 30 L`], ['20L', (n) => `${n} × 20 L`],
]

// The sheet changes a few times a week and the Cellar page reloads every minute
let cache: { at: number; packs: Pack[] } | null = null
const TEN_MINUTES = 10 * 60_000

async function packs(): Promise<Pack[]> {
  if (cache && Date.now() - cache.at < TEN_MINUTES) return cache.packs
  try {
    cache = { at: Date.now(), packs: (await getPacks(adelaideNow())) as Pack[] }
  } catch (err) {
    console.error('[tank-splits] Splits sheet not read:', err instanceof Error ? err.message : err)
    // Keep showing the last good read rather than blanking every card
    cache = { at: Date.now() - TEN_MINUTES + 60_000, packs: cache?.packs ?? [] }
  }
  return cache.packs
}

/**
 * Match each beer in tank to its row on the Splits sheet. Where one beer is in
 * two tanks, the older brew takes the earlier pack. A pack up to two weeks
 * overdue still counts: beer is often packed a few days after the sheet says.
 */
export async function splitsByTank(tanks: TankDashboardData[]): Promise<Map<string, SheetSplit>> {
  const out = new Map<string, SheetSplit>()
  const all = await packs()
  if (!all.length) return out
  const now = adelaideNow()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14)
  const open = all.filter((p) => p.date >= from).sort((a, b) => +a.date - +b.date)
  const taken = new Set<Pack>()

  // A recent row on the sheet may already have been packed. If a batch of that
  // beer was packaged within a few days of the row's date, the row is spent.
  const { data: recent } = await createServiceClient()
    .from('packaging_runs').select('packaged_at, brews(beer_name)')
    .gte('packaged_at', new Date(+from - 7 * 86_400_000).toISOString())
  for (const run of (recent ?? []) as { packaged_at: string; brews: { beer_name: string } | { beer_name: string }[] | null }[]) {
    const name = (Array.isArray(run.brews) ? run.brews[0] : run.brews)?.beer_name
    if (!name) continue
    const packedOn = +new Date(run.packaged_at)
    const spent = open.find((p) => !taken.has(p) && brandMatches(brandOf(name), p.key) && Math.abs(+p.date - packedOn) <= 6 * 86_400_000)
    if (spent) taken.add(spent)
  }

  const live = tanks
    .filter((t) => t.brew && t.brew.stage !== 'empty')
    .sort((a, b) => a.brew!.brew_day.localeCompare(b.brew!.brew_day))
  for (const t of live) {
    const brand = brandOf(t.brew!.beer_name)
    if (!brand) continue
    const hit = open.find((p) => !taken.has(p) && brandMatches(brand, p.key))
    if (!hit) continue
    taken.add(hit)
    out.set(t.tank.id, {
      date: dayKey(hit.date),
      label: hit.beer.replace(/\s*\((proposed|tbc|tentative)\)\s*/gi, ' ').trim(),
      parts: PART.filter(([k]) => hit.qty[k] > 0).map(([k, fmt]) => fmt(hit.qty[k])),
      proposed: /\(proposed\)/i.test(hit.beer),
    })
  }
  return out
}
