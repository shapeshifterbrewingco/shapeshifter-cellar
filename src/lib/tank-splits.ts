// What each beer in tank is planned to be packed into, read from the Packaging
// Splits sheet (the same rows the Sales App and the planner use), whether the
// beer in the tank is enough for it, and the one thing Cellar writes back: the
// tank's volume, into the row's FV VOL column.

import { getPacks, brandOf, brandMatches, SPLITS_SHEET_ID } from '@/lib/planner/sales-app/splits'
import { adelaideNow, dayKey, sheetTabs, sheetValues, sheetUpdate } from '@/lib/planner/google'
import { createServiceClient } from '@/lib/supabase/server'
import type { TankDashboardData } from '@/types'
import { isRtd } from '@/lib/rtd'
import { spiritLitres } from '@/lib/brew-sheet'

type SpiritLines = Parameters<typeof spiritLitres>[0]

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

/** After Cellar edits the sheet, so the next read shows the change rather than a ten-minute-old copy */
export function forgetSplitsCache() {
  cache = null
}

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

function fitFor(volume: number, plannedL: number, inBrite: boolean, yieldShare: number, brewDayVolume: number | null): SplitFit | null {
  if (!(volume > 0) || !(plannedL > 0)) return null
  // Past yields are measured from the brew day volume. If bottoms have already
  // come off, that loss is behind us: work from the brew day figure, not the
  // lower one, or it would be taken off twice.
  const fromBrewDay = !inBrite && brewDayVolume != null && brewDayVolume > volume
  const packable = inBrite ? volume * BRITE_YIELD : Math.min(volume * BRITE_YIELD, (fromBrewDay ? brewDayVolume : volume) * yieldShare)
  const share = packable / volume
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
  const [{ data: recent }, { data: moved }, typical, { data: daySheets }] = await Promise.all([
    db.from('packaging_runs').select('packaged_at, brews(beer_name)')
      .gte('packaged_at', new Date(+from - 7 * 86_400_000).toISOString()),
    live.length
      ? db.from('transfers').select('brew_id').in('brew_id', live.map((t) => t.brew!.id))
      : Promise.resolve({ data: [] as { brew_id: string }[] }),
    typicalYields(),
    live.length
      ? db.from('brew_sheets').select('brew_id, fv:data->fv->>volume_l, dry_hops:data->dry_hops').in('brew_id', live.map((t) => t.brew!.id))
      : Promise.resolve({ data: [] as { brew_id: string; fv: string | null; dry_hops: SpiritLines }[] }),
  ])
  const rtdIds = new Set(live.filter((t) => isRtd(t.brew!.beer_name, t.brew!.style)).map((t) => t.brew!.id))
  // A lemonade's brew day volume is what was knocked out plus the spirit
  const brewDay = new Map((daySheets ?? []).map((d) => {
    const row = d as { brew_id: string; fv: string | null; dry_hops: SpiritLines }
    const v = parseFloat(row.fv ?? '') || null
    return [row.brew_id, v != null && rtdIds.has(row.brew_id) ? v + spiritLitres(row.dry_hops) : v]
  }))
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
      fit: fitFor(Number(t.brew!.volume_l), plannedL, transferred.has(t.brew!.id), typical.by.get(brand) ?? typical.all, brewDay.get(t.brew!.id) ?? null),
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

type Located = {
  tab: string
  rows: unknown[][]
  headerAt: number
  rowAt: number
  split: SheetSplit
  brew: { id: string; volume_l: number; beer_name: string }
}

/** Find a brew's row on the Splits sheet: the same row its tank card shows. */
async function locateSplitRow(brewId: string): Promise<Located | { error: string }> {
  const db = createServiceClient()
  const { data: brews } = await db
    .from('brews').select('id, tank_id, beer_name, brew_day, stage, volume_l')
    .is('deleted_at', null).not('stage', 'in', '(empty,transferred,packaged)')
  const mine = (brews ?? []).find((b) => b.id === brewId)
  if (!mine) return { error: 'That beer is no longer in a tank.' }

  // Match every tank, not just this one, so two tanks of one beer take the same rows the cards show
  const asTanks = (brews ?? []).map((b) => ({ tank: { id: b.tank_id }, brew: b })) as unknown as Pick<TankDashboardData, 'tank' | 'brew'>[]
  const split = (await splitsByTank(asTanks)).get(mine.tank_id)
  if (!split) return { error: `No row on the Splits sheet matches ${mine.beer_name}.` }

  const [y, m] = split.date.split('-').map(Number)
  const tab = (await sheetTabs(SPLITS_SHEET_ID)).find((t) => {
    const hit = /^([A-Za-z]+)\s+(\d{4})$/.exec(t.trim())
    return hit && Number(hit[2]) === y && MONTHS.indexOf(hit[1].slice(0, 3).toLowerCase()) === m - 1
  })
  if (!tab) return { error: 'Could not find that month on the Splits sheet.' }

  const rows = await sheetValues(SPLITS_SHEET_ID, `'${tab}'!A1:Z60`, { unformatted: true })
  const headerAt = rows.findIndex((r) => r.some((c) => String(c).trim().toUpperCase() === 'FV VOL'))
  if (headerAt < 0) return { error: `The ${tab} tab has no FV VOL column.` }

  let date = ''
  let rowAt = -1
  for (let i = headerAt + 1; i < rows.length; i++) {
    const label = rows[i][1]
    if (typeof label === 'string' && /^total/i.test(label.trim())) break
    if (typeof label === 'number' && label > 40000) { date = serialKey(label); continue }
    if (date === split.date && typeof label === 'string' && label.trim() === split.rawLabel.trim()) { rowAt = i; break }
  }
  if (rowAt < 0) return { error: `Could not find the ${split.label} row on the ${tab} tab. It may have just been edited.` }
  return { tab, rows, headerAt, rowAt, split, brew: { id: mine.id, volume_l: Number(mine.volume_l), beer_name: mine.beer_name } }
}

const failMessage = (err: unknown, what: string) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[tank-splits] ${what}:`, message)
  return /\b403\b/.test(message) ? 'Cellar is not allowed to edit the Splits sheet yet.' : 'The Splits sheet could not be updated.'
}

/**
 * Put a brew's current volume into the FV VOL cell of its row on the Splits
 * sheet. Only that one cell is touched. Never throws.
 */
export async function writeSplitVolume(brewId: string): Promise<SplitWrite> {
  try {
    const found = await locateSplitRow(brewId)
    if ('error' in found) return { ok: false, message: found.error }
    const { tab, rows, headerAt, rowAt, split, brew } = found
    const col = rows[headerAt].findIndex((c) => String(c).trim().toUpperCase() === 'FV VOL')

    const now = Math.round(brew.volume_l)
    const before = rows[rowAt][col]
    const was = typeof before === 'number' ? before : parseFloat(String(before ?? '')) || null
    const where = `${split.label}, ${tab}`
    if (was === now) return { ok: true, changed: false, was, now, row: where }
    await sheetUpdate(SPLITS_SHEET_ID, `'${tab}'!${colLetter(col)}${rowAt + 1}`, [[now]])
    return { ok: true, changed: true, was, now, row: where }
  } catch (err) {
    return { ok: false, message: failMessage(err, 'volume not written') }
  }
}

/** The format columns Cellar can change, by their header on the sheet */
const QTY_HEADERS: [keyof SheetSplit['qty'], string][] = [['c16', '16PK'], ['c24', '24PK'], ['keg20', '20L'], ['keg30', '30L'], ['keg50', '50L']]

/**
 * Change how many of each format a brew's row plans. Only the format cells that
 * changed are written; totals and excise are formulas on the sheet and follow.
 * A format the month's tab has no column for cannot be set. Never throws.
 */
export async function writeSplitQty(brewId: string, qty: SheetSplit['qty']): Promise<{ ok: true; row: string; changed: string[] } | { ok: false; message: string }> {
  try {
    for (const [k] of QTY_HEADERS) {
      const n = qty[k]
      if (!Number.isFinite(n) || n < 0 || n > 2000) return { ok: false, message: 'Quantities must be whole numbers from 0 up.' }
    }
    const found = await locateSplitRow(brewId)
    if ('error' in found) return { ok: false, message: found.error }
    const { tab, rows, headerAt, rowAt, split } = found
    const header = rows[headerAt].map((c) => String(c).trim().toUpperCase())

    const writes: { cell: string; value: number | string; what: string }[] = []
    for (const [k, h] of QTY_HEADERS) {
      const col = header.indexOf(h)
      const want = Math.round(qty[k])
      if (col < 0) {
        if (want > 0) return { ok: false, message: `The ${tab} tab has no ${h} column, so ${h} cannot be planned there.` }
        continue
      }
      const before = rows[rowAt][col]
      const was = typeof before === 'number' ? before : parseFloat(String(before ?? '')) || 0
      if (was === want) continue
      // Zero is left blank, as the sheet does
      writes.push({ cell: `'${tab}'!${colLetter(col)}${rowAt + 1}`, value: want || '', what: `${h} ${was} to ${want}` })
    }
    for (const w of writes) await sheetUpdate(SPLITS_SHEET_ID, w.cell, [[w.value]])
    if (writes.length) forgetSplitsCache()
    return { ok: true, row: `${split.label}, ${tab}`, changed: writes.map((w) => w.what) }
  } catch (err) {
    return { ok: false, message: failMessage(err, 'splits not written') }
  }
}
