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

/** "Day 0", "day 0", "0": goes in on brew day itself, even though it sits with the cellar additions */
export const isDayZero = (l: SheetLine) => /^(day\s*)?0$/i.test(l.when.trim())

/** Every line worked through on brew day, in sheet order: the brew-day lists plus any Day 0 additions. */
export function brewDayLines(s: BrewSheetData): { line: SheetLine; malt: boolean }[] {
  return [
    ...BREW_DAY_LISTS.flatMap((k) => s[k].map((line) => ({ line, malt: k === 'malt' }))),
    ...s.dry_hops.filter(isDayZero).map((line) => ({ line, malt: false })),
  ]
}

/**
 * Fill the boxes that are nearly always the same, from the recipe where it
 * says and from habit where it does not (a 60 minute boil). Only empty boxes
 * are touched, so anything the brewer typed stays as typed.
 */
export function withRecipeDefaults(
  s: BrewSheetData,
  recipe: { boil_duration_min?: number | null; mash_temp_c?: number | null; pitch_temp_c?: number | null; ferment_temp_c?: number | null } | null,
): BrewSheetData {
  const or = (current: string, value: number | null | undefined, fallback = '') => current.trim() || (value != null ? String(Number(value)) : fallback)
  return {
    ...s,
    mash: { ...s.mash, target_temp_c: or(s.mash.target_temp_c, recipe?.mash_temp_c) },
    kettle: { ...s.kettle, boil_minutes: or(s.kettle.boil_minutes, recipe?.boil_duration_min, '60') },
    yeast: { ...s.yeast, pitch_temp_c: or(s.yeast.pitch_temp_c, recipe?.pitch_temp_c), set_temp_c: or(s.yeast.set_temp_c, recipe?.ferment_temp_c) },
  }
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
export function sheetProgress(s: BrewSheetData, rtd = false): { filled: number; total: number } {
  // A hard lemonade has no mash, runnings, gravity or yeast to record
  const scalars = rtd ? [s.kettle.volume_l, s.fv.volume_l, s.fv.temp_c] : [
    s.mash.actual_temp_c, s.mash.ph, s.runnings.first.plato, s.runnings.last.plato,
    s.kettle.volume_l, s.kettle.post_boil_plato, s.fv.volume_l, s.fv.plato, s.fv.ph,
    s.yeast.strain, s.yeast.lot,
  ]
  // Dry hops and cellar additions go in days later, so they never count against
  // the brew day. Day 0 additions do: they go in before the day is done.
  const lines = brewDayLines(s).map((x) => x.line)
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

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const sameAmount = (a: string, b: string) => {
  const x = sheetNumber(a), y = sheetNumber(b)
  return x == null || y == null ? a.trim() === b.trim() : x === y
}
const LIST_WORDS: Record<ListKey, string> = { malt: 'malt', mash_additions: 'mash addition', kettle_additions: 'kettle addition', kettle_hops: 'kettle hop', dry_hops: 'dry hop or cellar addition' }

/**
 * What a brewer changed on the day, against the recipe the sheet was laid out
 * from. One plain sentence per change, for the brewer to read before deciding
 * whether the recipe itself should change. Empty when the sheet matches.
 */
export function recipeChanges(recipe: BrewSheetData, sheet: BrewSheetData): string[] {
  const out: string[] = []
  const amount = (l: SheetLine) => [l.amount, l.unit].filter(Boolean).join(' ') || 'no amount'
  for (const key of LIST_KEYS) {
    const was = recipe[key], now = sheet[key].filter((l) => l.name.trim())
    for (const l of now) {
      const before = was.find((w) => sameName(w.name, l.name))
      const swapped = /^Substituted for (.+)$/.exec(l.note)?.[1]
      if (!before) out.push(swapped ? `${l.name} in place of ${swapped}` : `Added ${l.name} (${amount(l)}) as a ${LIST_WORDS[key]}`)
      else {
        if (!sameAmount(before.amount, l.amount)) out.push(`${l.name}: ${amount(before)} is now ${amount(l)}`)
        if (before.when.trim() !== l.when.trim() && key !== 'malt') out.push(`${l.name}: timing "${before.when || 'none'}" is now "${l.when || 'none'}"`)
      }
    }
    for (const w of was) {
      const stillThere = now.some((l) => sameName(l.name, w.name) || /^Substituted for (.+)$/.exec(l.note)?.[1]?.toLowerCase() === w.name.trim().toLowerCase())
      if (!stillThere) out.push(`Removed ${w.name}`)
    }
  }
  const scalar = (label: string, a: string, b: string, unit = '') => {
    if (b.trim() && a.trim() && !sameAmount(a, b)) out.push(`${label}: ${a}${unit} is now ${b}${unit}`)
    else if (b.trim() && !a.trim()) out.push(`${label}: now ${b}${unit}`)
  }
  if (recipe.yeast.strain.trim() && sheet.yeast.strain.trim() && !sameName(recipe.yeast.strain, sheet.yeast.strain)) out.push(`Yeast: ${recipe.yeast.strain} is now ${sheet.yeast.strain}`)
  if (recipe.yeast.amount.trim() && sheet.yeast.amount.trim() && !sameAmount(recipe.yeast.amount, sheet.yeast.amount)) out.push(`Yeast amount: ${recipe.yeast.amount} is now ${sheet.yeast.amount}`)
  scalar('Mash target', recipe.mash.target_temp_c, sheet.mash.target_temp_c, '°C')
  scalar('Boil', recipe.kettle.boil_minutes, sheet.kettle.boil_minutes, ' min')
  scalar('Pitch temp', recipe.yeast.pitch_temp_c, sheet.yeast.pitch_temp_c, '°C')
  scalar('Set temp', recipe.yeast.set_temp_c, sheet.yeast.set_temp_c, '°C')
  return out
}

// Enzymes, finings and process aids share the cellar additions list with the hops and fruit
const NOT_HOP_OR_FRUIT = /aldc|enzyme|zinc|antifoam|hop ?aid|biofine|finings|nutrient|tetra|sorbate|spirit|servomyces|whirlfloc|poly ?gel/i

/** One thing that goes in after brew day. `index` is its place in the sheet's dry hop list. */
export interface AdditionLine { index: number; name: string; amount: string; when: string; done: boolean; note: string }

/** Where a beer is up to with what goes in after brew day: dry hops, fruit, finings. */
export interface AdditionStatus {
  lines: AdditionLine[]
  /** How many are still to go in */
  todo: number
  /** True while a hop or fruit addition is still to go, as opposed to only finings and the like */
  hopsOrFruitToGo: boolean
}

/** Works from the after-brew-day lines only: Day 0 additions belong to the brew day. */
export function additionStatus(dryHops: SheetLine[]): AdditionStatus | null {
  const lines = dryHops
    .map((l, index) => ({ l, index }))
    .filter(({ l }) => l.name.trim() && !isDayZero(l))
    .map(({ l, index }) => ({ index, name: l.name.trim(), amount: [l.amount, l.unit].filter(Boolean).join(' '), when: l.when, done: l.done, note: l.note }))
  if (!lines.length) return null
  const todo = lines.filter((l) => !l.done)
  return { lines, todo: todo.length, hopsOrFruitToGo: todo.some((l) => !NOT_HOP_OR_FRUIT.test(l.name)) }
}
