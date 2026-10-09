// Tank allocation for the Findon cellar. TypeScript port of
// .claude/skills/production-forecast/allocate_tanks.py (9 Oct 2026) - same
// rules, same choices. Cellar rules live in cellar.json, not here.
//
// Event grammar
//   BREW FVn - <beer>            FVn occupied
//   BREW - <beer>                unassigned, needs a tank
//   TRANSFER FVn > BBT - <beer>  FVn freed
//   TRANSFER FVn > FVm - <beer>  FVn freed, FVm occupied
//   PACK FVn - <beer>            FVn freed
//   PACK <BBT|->  - <beer>       frees the vessel holding that beer

import cellarJson from './cellar.json'

type Vessel = { type: string; large?: boolean; racking_arm?: boolean; note?: string }
type Attrs = { needs_large: boolean; dry_hopped: boolean; note?: string; _assumed?: boolean; lemonade?: boolean }
export type Cellar = { vessels: Record<string, Vessel>; beer_attributes: Record<string, Attrs | string> }
export type TankEvent = [string, string] // [YYYY-MM-DD, summary]

export const cellar = cellarJson as unknown as Cellar

const FAR = '2099-01-01'
const EPOCH = '2000-01-01'

function addWeeks(key: string, w: number) {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 7 * w))
  return dt.toISOString().slice(0, 10)
}

export function attrsFor(beer: string, c: Cellar = cellar): Attrs {
  let best: Attrs | null = null
  let blen = -1
  for (const [k, v] of Object.entries(c.beer_attributes)) {
    if (k.startsWith('_') || typeof v === 'string') continue
    if (beer.toLowerCase().includes(k.toLowerCase()) && k.length > blen) { best = v; blen = k.length }
  }
  if (!best && beer.toLowerCase().includes('sour')) best = c.beer_attributes.sour as Attrs
  // Unknown beer: assume the strict case so we never silently break a rule
  return best || { needs_large: false, dry_hopped: true, _assumed: true }
}

const STOP = new Set(['brew', 'pack', 'transfer', 'bbt', 'bbta', 'bbtb', 'split', 'only', 'collab',
  'beer', 'abv', 'low', 'the', 'for', 'and', 'with', 'midi', 'ale', 'seasonal',
  'birthday', 'from', 'jm', 'new'])

const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)

function key(text: string) {
  let t = text.replace(/^(BREW|TRANSFER|PACK)\b/i, ' ')
  t = t.replace(/FV\s*\d+/gi, ' ').replace(/[^A-Za-z ]/g, ' ')
  return new Set(t.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem))
}

function fmt(text: string) {
  const T = text.toLowerCase()
  const c = T.includes('carton') || T.includes('can')
  const k = T.includes('keg')
  return c && !k ? 'carton' : k && !c ? 'keg' : null
}

function sameBeer(a: string, b: string) {
  const fa = fmt(a), fb = fmt(b)
  if (fa && fb && fa !== fb) return false // cartons never match a keg run
  const ka = key(a), kb = key(b)
  if (!ka.size || !kb.size) return false
  const need = Math.min(ka.size, kb.size) >= 2 ? 2 : 1
  let n = 0
  ka.forEach((w) => { if (kb.has(w)) n++ })
  return n >= need
}

const sortEvents = (events: TankEvent[]) =>
  [...events].sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1))

function parse(events: TankEvent[], c: Cellar) {
  const fvs = Object.keys(c.vessels).filter((v) => v.startsWith('FV'))
  const freeFrom: Record<string, string> = {}
  const holder: Record<string, string> = {}
  const unassigned: [string, string][] = []
  const releaseHolderOf = (su: string, d: string) => {
    for (const [v, b] of Object.entries(holder)) {
      if (sameBeer(b, su)) { freeFrom[v] = d; delete holder[v]; break }
    }
  }
  for (const [d, su] of sortEvents(events)) {
    const S = su.toUpperCase()
    const beer = su.replace(/^(BREW|TRANSFER|PACK)\s*/i, '').replace(/^[\s-]+|[\s-]+$/g, '')
    if (S.startsWith('TRANSFER')) {
      const ids = [...S.matchAll(/FV\s*(\d+)/g)].map((m) => m[1])
      if (ids.length) {
        const src = 'FV' + ids[0]
        freeFrom[src] = d
        delete holder[src]
        const dest = S.includes('>') ? S.split('>').slice(1).join('>') : ''
        const m = /FV\s*(\d+)/.exec(dest)
        if (m) { holder['FV' + m[1]] = su; delete freeFrom['FV' + m[1]] }
      } else {
        releaseHolderOf(su, d) // e.g. "TRANSFER - Divide by Zero to BBT"
      }
    } else if (S.startsWith('BREW')) {
      const m = /FV\s*(\d+)/.exec(S)
      if (m) { holder['FV' + m[1]] = su; delete freeFrom['FV' + m[1]] }
      else unassigned.push([d, beer])
    } else if (S.startsWith('PACK')) {
      const m = /\bFV\s*(\d+)/.exec(S)
      if (m) { freeFrom['FV' + m[1]] = d; delete holder['FV' + m[1]] }
      else releaseHolderOf(su, d)
    }
  }
  for (const v of fvs) {
    if (v in holder) freeFrom[v] = FAR // committed, no release scheduled
    else freeFrom[v] ??= EPOCH
  }
  return { freeFrom, holder, unassigned }
}

function matchRelease(beer: string, brewDate: string, events: TankEvent[], dflt: string) {
  for (const [d, su] of sortEvents(events)) {
    if (!/^\s*(PACK|TRANSFER)/i.test(su) || d <= brewDate) continue
    if (sameBeer(beer, su)) return d
  }
  return dflt
}

function fits(v: string, meta: Vessel, a: Attrs, bd: string, rd: string,
  occ: Record<string, [string, string][]>, freeFrom: Record<string, string>) {
  if (meta.type === 'brite' && !a.lemonade) return false
  if (bd < (freeFrom[v] ?? EPOCH)) return false
  if (a.needs_large && !meta.large) return false
  if (a.dry_hopped && !meta.racking_arm) return false
  for (const [ob, orl] of occ[v] || []) if (!(rd <= ob || bd >= orl)) return false
  return true
}

export interface Allocation {
  brew_date: string
  beer: string
  tank: string | null
  holds_until: string
  reason: string
  assumed_dry_hopped: boolean
  problem: boolean
}

export function allocate(events: TankEvent[], manual?: Record<string, string>, c: Cellar = cellar) {
  const { freeFrom, holder, unassigned } = parse(events, c)
  const occ: Record<string, [string, string][]> = {}
  const rows: Allocation[] = []
  const rank = (v: string) => [c.vessels[v].racking_arm ?? true, c.vessels[v].large ?? false, freeFrom[v] ?? EPOCH] as const
  for (const [bd, beer] of [...unassigned].sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1))) {
    const a: Attrs = { ...attrsFor(beer, c) }
    a.lemonade = /lemon/i.test(beer)
    const rd = matchRelease(beer, bd, events, addWeeks(bd, 5))
    let chosen: string | null = null
    let why = ''
    if (manual && manual[beer]) {
      chosen = manual[beer]
      why = c.vessels[chosen] && fits(chosen, c.vessels[chosen], a, bd, rd, occ, freeFrom) ? 'manual' : 'MANUAL - CONSTRAINT BREACH'
    } else {
      // Lemonade -> brite; low-hop -> spend a no-racking-arm tank; otherwise the
      // least capable tank that still fits (keep big and flexible tanks free)
      const cands = Object.keys(c.vessels).filter((v) => fits(v, c.vessels[v], a, bd, rd, occ, freeFrom))
      if (a.lemonade) cands.sort((x, y) => Number(c.vessels[x].type !== 'brite') - Number(c.vessels[y].type !== 'brite'))
      else cands.sort((x, y) => {
        const rx = rank(x), ry = rank(y)
        for (let i = 0; i < 3; i++) if (rx[i] !== ry[i]) return rx[i] < ry[i] ? -1 : 1
        return 0
      })
      if (cands.length) {
        chosen = cands[0]
        const m = c.vessels[chosen]
        why = a.lemonade ? 'brite/lemonade'
          : !(m.racking_arm ?? true) ? 'low-hop - uses a no-racking-arm tank'
          : a.needs_large ? 'large tank required'
          : `free from ${freeFrom[chosen]}`
      }
    }
    if (chosen) (occ[chosen] ||= []).push([bd, rd])
    rows.push({
      brew_date: bd, beer, tank: chosen, holds_until: rd, reason: chosen ? why : 'UNPLACEABLE - no tank satisfies the rules on this date',
      assumed_dry_hopped: !!a._assumed, problem: !chosen || why.includes('BREACH'),
    })
  }
  const used = new Set(rows.map((r) => r.tank).filter(Boolean))
  const unused = Object.keys(c.vessels).filter((v) => v.startsWith('FV') && !used.has(v))
  return {
    vessels_free_from: Object.fromEntries(
      Object.keys(freeFrom).sort((x, y) => +x.slice(2) - +y.slice(2)).map((v) => [v, freeFrom[v] === FAR ? 'committed, no release booked' : freeFrom[v] === EPOCH ? 'free now' : freeFrom[v]]),
    ),
    still_committed: holder,
    allocations: rows,
    unused_fermenters: unused.map((v) => (c.vessels[v].racking_arm ?? true) ? v : `${v} (no racking arm - lager or dark low-hop only)`),
    problems: rows.filter((r) => r.problem).length,
  }
}
