// The brew day record: the front of the paper brew sheet, as data.
//
// Every value is kept as text exactly as the brewer typed it (or as it was read
// off a photo). A brew sheet is a record of what was written down on the day,
// and "12.1" must come back as "12.1", not 12.100000001 or null. Numbers are
// parsed only where something else needs them (the tank card's OG and volume).

export interface SheetLine {
  name: string
  /** "225", "2.5", "600" */
  amount: string
  /** "kg", "g", "mL", "bags" */
  unit: string
  /** Time or trigger: "60 min", "WP @ 85c", "Active", "FG", "Day 3" */
  when: string
  /** Ticked off on the day */
  done: boolean
  /** Lot number, date added, anything scribbled beside the line */
  note: string
}

// A type alias, not an interface, so it can be passed where a plain string map is expected
export type Runnings = { time: string; plato: string; ph: string }

export interface BrewSheetData {
  brewer: string
  cellar: string
  base_malt_batch: string

  malt: SheetLine[]
  mash_additions: SheetLine[]
  kettle_additions: SheetLine[]
  kettle_hops: SheetLine[]
  dry_hops: SheetLine[]

  mash: { time: string; target_temp_c: string; actual_temp_c: string; ph: string; acid: string }
  runnings: { first: Runnings; mid: Runnings; last: Runnings }
  kettle: {
    volume_l: string; boil_start: string; boil_minutes: string
    post_boil_volume_l: string; post_boil_plato: string; post_boil_ph: string
    dilution_l: string
  }
  fv: { temp_c: string; volume_l: string; plato: string; ph: string }
  yeast: { strain: string; amount: string; lot: string; best_before: string; pitch_temp_c: string; set_temp_c: string }
  /** Initials of whoever signed it off. Empty = not done. */
  signoffs: { aldc: string; frigid_set: string }
  notes: string
}

export const LIST_KEYS = ['malt', 'mash_additions', 'kettle_additions', 'kettle_hops', 'dry_hops'] as const
export type ListKey = (typeof LIST_KEYS)[number]
/** The lists that are worked through on brew day itself */
export const BREW_DAY_LISTS = ['malt', 'mash_additions', 'kettle_additions', 'kettle_hops'] as const

// Maltsters that pack in 12.5 kg bags, not the usual 25 kg. Matched on the malt's name.
const SMALL_BAG_BRANDS = ['voyager']

/**
 * Malt in bags. "200" kg -> "8 bags". Voyager packs in 12.5 kg bags, so its
 * malts count in "small bags". Empty when the amount is not a weight in kg.
 */
export function bagsLabel(amount: string, unit: string, name = ''): string {
  const kg = Number(amount)
  if (!amount.trim() || !Number.isFinite(kg) || kg <= 0 || (unit.trim() && unit.trim().toLowerCase() !== 'kg')) return ''
  const small = SMALL_BAG_BRANDS.some((b) => name.toLowerCase().includes(b))
  const bags = kg / (small ? 12.5 : 25)
  const text = Number.isInteger(bags) ? String(bags) : bags === 0.5 ? '½' : String(Math.round(bags * 100) / 100)
  return `${text} ${small ? 'small ' : ''}bag${bags > 1 ? 's' : ''}`
}

const emptyRunnings = (): Runnings => ({ time: '', plato: '', ph: '' })

export function emptySheet(): BrewSheetData {
  return {
    brewer: '', cellar: '', base_malt_batch: '',
    malt: [], mash_additions: [], kettle_additions: [], kettle_hops: [], dry_hops: [],
    mash: { time: '', target_temp_c: '', actual_temp_c: '', ph: '', acid: '' },
    runnings: { first: emptyRunnings(), mid: emptyRunnings(), last: emptyRunnings() },
    kettle: { volume_l: '', boil_start: '', boil_minutes: '', post_boil_volume_l: '', post_boil_plato: '', post_boil_ph: '', dilution_l: '' },
    fv: { temp_c: '', volume_l: '', plato: '', ph: '' },
    yeast: { strain: '', amount: '', lot: '', best_before: '', pitch_temp_c: '', set_temp_c: '' },
    signoffs: { aldc: '', frigid_set: '' },
    notes: '',
  }
}

const text = (v: unknown, max = 200): string =>
  v == null ? '' : String(typeof v === 'number' && !Number.isFinite(v) ? '' : v).trim().slice(0, max)

function line(v: unknown): SheetLine | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const name = text(o.name, 120)
  if (!name) return null
  return { name, amount: text(o.amount, 20), unit: text(o.unit, 12), when: text(o.when, 40), done: o.done === true, note: text(o.note, 120) }
}

function group<T extends Record<string, string>>(shape: T, v: unknown): T {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return Object.fromEntries(Object.keys(shape).map((k) => [k, text(o[k], 60)])) as T
}

/**
 * Whatever came in (a save from the form, a model's reading of a photo, an old
 * row), return a complete, well-formed sheet. Unknown keys are dropped and
 * nothing is trusted to be the right type.
 */
export function sanitiseSheet(input: unknown): BrewSheetData {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const e = emptySheet()
  const lists = Object.fromEntries(
    LIST_KEYS.map((k) => [k, (Array.isArray(o[k]) ? (o[k] as unknown[]) : []).map(line).filter((l): l is SheetLine => !!l).slice(0, 40)]),
  ) as Pick<BrewSheetData, ListKey>
  const r = (o.runnings && typeof o.runnings === 'object' ? o.runnings : {}) as Record<string, unknown>
  return {
    brewer: text(o.brewer, 60), cellar: text(o.cellar, 60), base_malt_batch: text(o.base_malt_batch, 40),
    ...lists,
    mash: group(e.mash, o.mash),
    runnings: { first: group(emptyRunnings(), r.first), mid: group(emptyRunnings(), r.mid), last: group(emptyRunnings(), r.last) },
    kettle: group(e.kettle, o.kettle),
    fv: group(e.fv, o.fv),
    yeast: group(e.yeast, o.yeast),
    signoffs: group(e.signoffs, o.signoffs),
    notes: text(o.notes, 4000),
  }
}

/** "12,1" or "12.1°P" -> 12.1. Null when it is not a number. */
export function sheetNumber(v: string | null | undefined): number | null {
  if (!v) return null
  const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

interface RecipeLine {
  name: string
  addition_stage: string
  quantity: number | null
  unit: string | null
  time_minutes: number | null
  trigger: string | null
}

/** A fresh sheet for a brew, with the recipe's lines laid out ready to tick off. */
export function sheetFromRecipe(lines: RecipeLine[]): BrewSheetData {
  const sheet = emptySheet()
  for (const l of lines) {
    const entry: SheetLine = {
      name: l.name,
      amount: l.quantity != null ? String(l.quantity) : '',
      // "g/kg" is a column heading, not a unit. Leave it for the brewer to fill in.
      unit: l.unit && !l.unit.includes('/') ? l.unit : '',
      when: l.trigger || (l.time_minutes != null ? `${l.time_minutes} min` : ''),
      done: false,
      note: '',
    }
    switch (l.addition_stage) {
      case 'malt': sheet.malt.push(entry); break
      case 'mash_addition': case 'mash_hop': sheet.mash_additions.push(entry); break
      case 'kettle_addition': sheet.kettle_additions.push(entry); break
      case 'kettle_hop': sheet.kettle_hops.push(entry); break
      // Enzymes, finings and the like sit with the dry hops: all of it goes in after brew day
      case 'dry_hop': case 'process': sheet.dry_hops.push(entry); break
      case 'yeast':
        if (!sheet.yeast.strain) { sheet.yeast.strain = l.name; sheet.yeast.amount = [entry.amount, entry.unit].filter(Boolean).join(' ') }
        break
    }
  }
  return sheet
}

/** How much of the sheet has something in it, for a progress hint. */
export function sheetProgress(s: BrewSheetData): { filled: number; total: number } {
  const scalars = [
    s.mash.actual_temp_c, s.mash.ph, s.runnings.first.plato, s.runnings.last.plato,
    s.kettle.volume_l, s.kettle.post_boil_plato, s.fv.volume_l, s.fv.plato, s.fv.ph,
    s.yeast.strain, s.yeast.lot, s.signoffs.aldc, s.signoffs.frigid_set,
  ]
  // Dry hops and cellar additions go in days later, so they never count against the brew day
  const lines = BREW_DAY_LISTS.flatMap((k) => s[k])
  return {
    filled: scalars.filter((v) => v.trim()).length + lines.filter((l) => l.done).length,
    total: scalars.length + lines.length,
  }
}

/** A ferment-log row read off a sheet. */
export interface SheetReading {
  /** YYYY-MM-DD */
  date: string
  /** HH:MM, 24 hour. Empty if the row had no time. */
  time: string
  plato: number | null
  ph: number | null
  temp_c: number | null
  note: string
}
