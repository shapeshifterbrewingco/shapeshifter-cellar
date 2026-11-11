// A photo of the paper packaging report (the bottom half of the transfer and
// packaging sheet), read into the fields the app keeps. Shared by the read
// route and the two forms that fill from it: the Package form and History.

export interface PackSheetReading {
  beer_name: string
  /** YYYY-MM-DD, or '' */
  packaging_date: string
  batch_code: string
  /** YYYY-MM-DD, or '' */
  best_before: string
  bbt_temp_c: number | null
  bbt_co2_vol: number | null
  bbt_do_ppb: number | null
  bbt_do_ppb_high: number | null
  pack_co2_vol: number | null
  pack_do_ppb: number | null
  pack_do_ppb_high: number | null
  unders: string
  qty_keg30: number | null
  qty_keg50: number | null
  qty_16x440: number | null
  qty_24x375: number | null
  /** Only used to check the counts; the app works litres out itself */
  litres_total: number | null
  stock_venue_kegs: number | null
  stock_venue_cartons: number | null
  stock_options_kegs: number | null
  stock_options_cartons: number | null
  stock_sales_kegs: number | null
  stock_sales_cartons: number | null
  notes: string
  /** Keys above the reader was not sure of */
  uncertain: string[]
}

const NUMBER_KEYS = [
  'bbt_temp_c', 'bbt_co2_vol', 'bbt_do_ppb', 'bbt_do_ppb_high', 'pack_co2_vol', 'pack_do_ppb', 'pack_do_ppb_high',
  'qty_keg30', 'qty_keg50', 'qty_16x440', 'qty_24x375', 'litres_total',
  'stock_venue_kegs', 'stock_venue_cartons', 'stock_options_kegs', 'stock_options_cartons', 'stock_sales_kegs', 'stock_sales_cartons',
] as const

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim().replace(',', '.')) : NaN
  return Number.isFinite(n) ? n : null
}

/** YYYY-MM-DD, also taking the sheet's own day-first "11.11.26" in case the model returns it as written */
function sheetDate(v: unknown): string {
  const s = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(s)
  if (!m) return ''
  const [d, mo] = [Number(m[1]), Number(m[2])]
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return ''
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function sanitisePackSheet(raw: Record<string, unknown>): PackSheetReading {
  const text = (k: string, max: number) => String(raw[k] ?? '').trim().slice(0, max)
  const out = {
    beer_name: text('beer_name', 120),
    packaging_date: sheetDate(raw.packaging_date),
    batch_code: text('batch_code', 20),
    best_before: sheetDate(raw.best_before),
    unders: text('unders', 60),
    notes: text('notes', 1000),
    uncertain: (Array.isArray(raw.uncertain) ? raw.uncertain : []).filter((k): k is string => typeof k === 'string' && /^[a-z_0-9]+$/.test(k)).slice(0, 40),
  } as PackSheetReading
  for (const k of NUMBER_KEYS) {
    const n = num(raw[k])
    // Counts and DO can't go below nothing; only the brite temperature can
    out[k] = n != null && (n >= 0 || k === 'bbt_temp_c') ? n : null
  }
  // A range written high-low still reads low-high
  for (const [lo, hi] of [['bbt_do_ppb', 'bbt_do_ppb_high'], ['pack_do_ppb', 'pack_do_ppb_high']] as const) {
    if (out[lo] != null && out[hi] != null && out[hi]! < out[lo]!) [out[lo], out[hi]] = [out[hi], out[lo]]
  }
  return out
}

/** Send a shrunk photo (or two) of the sheet to be read. Nothing is saved. */
export async function readPackSheet(images: string[], hint: { beer_name?: string; batch_code?: string | null }): Promise<PackSheetReading> {
  const res = await fetch('/api/parse-pack-sheet', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, ...hint }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'The photo could not be read.')
  return out as PackSheetReading
}

/** Loose match, so "Golden Ratio" on the sheet passes for "Golden Ratio XPA" in the app */
export function sameBeer(onSheet: string, inApp: string): boolean {
  const a = onSheet.trim().toLowerCase()
  const b = inApp.trim().toLowerCase()
  if (!a || !b) return true
  return a.includes(b.slice(0, 6)) || b.includes(a.slice(0, 6))
}
