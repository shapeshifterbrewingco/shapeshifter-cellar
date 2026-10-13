// What each beer in tank is planned to be packed into, read from the Packaging
// Splits sheet (the same rows the Sales App and the planner use), whether the
// beer in the tank is enough for it, and the one thing Cellar writes back: the
// tank's volume, into the row's FV VOL column.

import { getPacks, brandOf, brandMatches, SPLITS_SHEET_ID } from '@/lib/planner/sales-app/splits'
import { adelaideNow, dayKey, sheetTabs, sheetValues, sheetUpdate } from '@/lib/planner/google'
import { createServiceClient } from '@/lib/supabase/server'
import type { TankDashboardData } from '@/types'

export interface SplitFit {
  /** short: not enough beer for the splits. spare: more than a keg left over. */
  kind: 'short' | 'spare' | 'ok'
  /** How far out, in litres. Always positive. */
  litres: number
  /** What the tank should pack out, in litres */
  packable: number
  /** In a fermenter the estimate leans on past batches; in a brite nearly all of it packs */
  basis: 'fv' | 'brite'
  /** Share of the tank volume expected to pack, as a whole percent */
  yieldPct: number
}

export interface SheetSplit {
  /** Pack day, YYYY-MM-DD */
  date: string
  /** The row's name on the sheet, e.g. "Golden Ratio CARTONS" */
  label: string
  /** Exactly as typed on the sheet, to find the row again */
  rawLabel: string
  /** "109 × 24pk", "22 × 50 L", biggest pack first */
  parts: string[]
  qty: { c24: number; c16: number; keg50: number; keg30: number; keg20: number }
  /** Litres the row adds up to */
  plannedL: number
  proposed: boolean
  fit: SplitFit | null
}

type Pack = { date: Date; beer: string; key: string; qty: Record<string, number> }

const PART: [string, (n: number) => string][] = [
  ['24PK', (n) => `${n} × 24pk`], ['16PK', (n) => `${n} × 16pk`],
  ['50L', (n) => `${n} × 50 L`], ['30L', (n) => `${n} × 30 L`], ['20L', (n) => `${n} × 20 L`],
]
const LITRES: Record<string, number> = { '24PK': 9, '16PK': 7.04, '50L': 50, '30L': 30, '20L': 20 }

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

// ── How much of a fermenter ends up packed ────────────────────────────────────
// Worked out from finished batches: litres packed over litres on the brew
// sheet. A beer with two or more batches uses its own average.

const OVERALL_YIELD = 0.82
const BRITE_YIELD = 0.97
let yields: { at: number; by: Map<string, number>; all: number } | null = null
const ONE_HOUR = 60 * 60_000

async function typicalYields() {
  if (yields && Date.now() - yields.at < ONE_HOUR) return yields
  const by = new Map<string, number>()
  let all = OVERALL_YIELD
  try {
    const db = createServiceClient()
    const [{ data: brews }, { data: finals }, { data: sheets }] = await Promise.all([
      db.from('brews').select('id, beer_name, volume_l').not('deleted_at', 'is', null).limit(2000),
      db.from('brew_finals').select('brew_id, packed_l').limit(2000),
      db.from('brew_sheets').select('brew_id, fv:data->fv->>volume_l').limit(2000),
    ])
    const packed = new Map((finals ?? []).map((f) => [f.brew_id as string, Number(f.packed_l)]))
    const fv = new Map((sheets ?? []).map((s) => [s.brew_id as string, parseFloat((s as { fv: string | null }).fv ?? '')]))
    const perBeer = new Map<string, number[]>()
    const every: number[] = []
    for (const b of brews ?? []) {
      const vol = fv.get(b.id) || Number(b.volume_l)
      const y = vol > 0 ? (packed.get(b.id) ?? 0) / vol : 0
      // Blends, barrel pulls and dumped batches are not a yield
      if (!(y >= 0.3 && y <= 1.1)) continue
      const key = brandOf(b.beer_name)
      perBeer.set(key, [...(perBeer.get(key) ?? []), y])
      every.push(y)
    }
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    if (every.length >= 5) all = mean(every)
    for (const [k, v] of perBeer) if (v.length >= 2) by.set(k, mean(v))
  } catch (err) {
    console.error('[tank-splits] yields not worked out:', err instanceof Error ? err.message : err)
  }
  yields = { at: Date.now(), by, all }
  return yields
}

function fitFor(volume: number, plannedL: number, inBrite: boolean, yieldShare: number): SplitFit | null {
  if (!(volume > 0) || !(plannedL > 0)) return null
  const share = inBrite ? BRITE_YIELD : yieldShare
  const packable = volume * share
  const diff = packable - plannedL
  // A fermenter estimate is rough, so it has to be well out before it is worth saying.
  // "Spare" starts at a keg's worth: less than that is not a decision anyone can make.
  const shortBy = inBrite ? 20 : volume * 0.05
  const spareBy = inBrite ? 50 : Math.max(50, volume * 0.07)
  return {
    kind: diff < -shortBy ? 'short' : diff > spareBy ? 'spare' : 'ok',
    litres: Math.round(Math.abs(diff)),
    packable: Math.round(packable),
    basis: inBrite ? 'brite' : 'fv',
    yieldPct: Math.round(share * 100),
  }
}

/**
 * Match each beer in tank to its row on the Splits sheet. Where one beer is in
 * two tanks, the older brew takes the earlier pack. A pack up to two weeks
 * overdue still counts: beer is often packed a few days after the sheet says.
 */
export async function splitsByTank(tanks: Pick<TankDashboardData, 'tank' | 'brew'>[]): Promise<Map<string, SheetSplit>> {
  const out = new Map<string, SheetSplit>()
  const all = await packs()
  if (!all.length) return out
  const now = adelaideNow()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14)
  const open = all.filter((p) => p.date >= from).sort((a, b) => +a.date - +b.date)
  const taken = new Set<Pack>()
  const db = createServiceClient()

  const live = tanks
    .filter((t) => t.brew && t.brew.stage !== 'empty')
    .sort((a, b) => a.brew!.brew_day.localeCompare(b.brew!.brew_day))

  // A recent row on the sheet may already have been packed. If a batch of that
  // beer was packaged within a few days of the row's date, the row is spent.
  const [{ data: recent }, { data: moved }, typical] = await Promise.all([
    db.from('packaging_runs').select('packaged_at, brews(beer_name)')
      .gte('packaged_at', new Date(+from - 7 * 86_400_000).toISOString()),
    live.length
      ? db.from('transfers').select('brew_id').in('brew_id', live.map((t) => t.brew!.id))
      : Promise.resolve({ data: [] as { brew_id: string }[] }),
    typicalYields(),
  ])
  for (const run of (recent ?? []) as { packaged_at: string; brews: { beer_name: string } | { beer_name: string }[] | null }[]) {
    const name = (Array.isArray(run.brews) ? run.brews[0] : run.brews)?.beer_name
    if (!name) continue
    const packedOn = +new Date(run.packaged_at)
    const spent = open.find((p) => !taken.has(p) && brandMatches(brandOf(name), p.key) && Math.abs(+p.date - packedOn) <= 6 * 86_400_000)
    if (spent) taken.add(spent)
  }
  const transferred = new Set((moved ?? []).map((m) => m.brew_id))

  for (const t of live) {
    const brand = brandOf(t.brew!.beer_name)
    if (!brand) continue
    const hit = open.find((p) => !taken.has(p) && brandMatches(brand, p.key))
    if (!hit) continue
    taken.add(hit)
    const plannedL = Object.entries(hit.qty).reduce((s, [k, n]) => s + (LITRES[k] ?? 0) * n, 0)
    out.set(t.tank.id, {
      date: dayKey(hit.date),
      label: hit.beer.replace(/\s*\((proposed|tbc|tentative)\)\s*/gi, ' ').trim(),
      rawLabel: hit.beer,
      parts: PART.filter(([k]) => hit.qty[k] > 0).map(([k, fmt]) => fmt(hit.qty[k])),
      qty: { c24: hit.qty['24PK'] ?? 0, c16: hit.qty['16PK'] ?? 0, keg50: hit.qty['50L'] ?? 0, keg30: hit.qty['30L'] ?? 0, keg20: hit.qty['20L'] ?? 0 },
      plannedL: Math.round(plannedL * 10) / 10,
      proposed: /\(proposed\)/i.test(hit.beer),
      fit: fitFor(Number(t.brew!.volume_l), plannedL, transferred.has(t.brew!.id), typical.by.get(brand) ?? typical.all),
    })
  }
  return out
}

// ── Writing the tank volume back to the sheet ────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const colLetter = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)))

/** Sheets serial (days since 30 Dec 1899) as YYYY-MM-DD, the same way the reader does it. */
function serialKey(n: number) {
  const d = new Date(1899, 11, 30)
  d.setDate(d.getDate() + Math.floor(n))
  return dayKey(d)
}

export type SplitWrite =
  | { ok: true; changed: boolean; was: number | null; now: number; row: string }
  | { ok: false; message: string }

/**
 * Put a brew's current volume into the FV VOL cell of its row on the Splits
 * sheet. Only that one cell is touched. Never throws.
 */
export async function writeSplitVolume(brewId: string): Promise<SplitWrite> {
  try {
    const db = createServiceClient()
    const { data: brews } = await db
      .from('brews').select('id, tank_id, beer_name, brew_day, stage, volume_l')
      .is('deleted_at', null).not('stage', 'in', '(empty,transferred,packaged)')
    const mine = (brews ?? []).find((b) => b.id === brewId)
    if (!mine) return { ok: false, message: 'That beer is no longer in a tank.' }

    // Match every tank, not just this one, so two tanks of one beer take the same rows the cards show
    const asTanks = (brews ?? []).map((b) => ({ tank: { id: b.tank_id }, brew: b })) as unknown as Pick<TankDashboardData, 'tank' | 'brew'>[]
    const split = (await splitsByTank(asTanks)).get(mine.tank_id)
    if (!split) return { ok: false, message: `No row on the Splits sheet matches ${mine.beer_name}.` }

    const [y, m] = split.date.split('-').map(Number)
    const tab = (await sheetTabs(SPLITS_SHEET_ID)).find((t) => {
      const hit = /^([A-Za-z]+)\s+(\d{4})$/.exec(t.trim())
      return hit && Number(hit[2]) === y && MONTHS.indexOf(hit[1].slice(0, 3).toLowerCase()) === m - 1
    })
    if (!tab) return { ok: false, message: 'Could not find that month on the Splits sheet.' }

    const rows = await sheetValues(SPLITS_SHEET_ID, `'${tab}'!A1:Z60`, { unformatted: true })
    const headerAt = rows.findIndex((r) => r.some((c) => String(c).trim().toUpperCase() === 'FV VOL'))
    if (headerAt < 0) return { ok: false, message: `The ${tab} tab has no FV VOL column.` }
    const col = rows[headerAt].findIndex((c) => String(c).trim().toUpperCase() === 'FV VOL')

    let date = ''
    let rowAt = -1
    for (let i = headerAt + 1; i < rows.length; i++) {
      const label = rows[i][1]
      if (typeof label === 'string' && /^total/i.test(label.trim())) break
      if (typeof label === 'number' && label > 40000) { date = serialKey(label); continue }
      if (date === split.date && typeof label === 'string' && label.trim() === split.rawLabel.trim()) { rowAt = i; break }
    }
    if (rowAt < 0) return { ok: false, message: `Could not find the ${split.label} row on the ${tab} tab. It may have just been edited.` }

    const now = Math.round(Number(mine.volume_l))
    const before = rows[rowAt][col]
    const was = typeof before === 'number' ? before : parseFloat(String(before ?? '')) || null
    const where = `${split.label}, ${tab}`
    if (was === now) return { ok: true, changed: false, was, now, row: where }
    await sheetUpdate(SPLITS_SHEET_ID, `'${tab}'!${colLetter(col)}${rowAt + 1}`, [[now]])
    return { ok: true, changed: true, was, now, row: where }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[tank-splits] volume not written:', message)
    return { ok: false, message: /\b403\b/.test(message) ? 'Cellar is not allowed to edit the Splits sheet yet.' : 'The Splits sheet could not be updated.' }
  }
}
