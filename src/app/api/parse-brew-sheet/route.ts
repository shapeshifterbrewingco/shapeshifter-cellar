// Reads a photo of a paper brew sheet into the app's brew sheet shape, for the
// days the phone stayed in a pocket. Nothing is saved here: the result goes
// back to the form for a person to check before it is kept.

import { NextResponse } from 'next/server'
import { anthropic, extractJsonObject } from '@/lib/claude'
import { staffEmail } from '@/lib/planner/session'
import { sanitiseSheet } from '@/lib/brew-sheet'
import type { SheetReading } from '@/lib/brew-sheet'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

// Handwriting is the hard part, so this uses the strongest model. It runs once per sheet.
const MODEL = process.env.BREW_SHEET_MODEL || 'claude-opus-5-5'
const MAX_IMAGES = 4
const MAX_IMAGE_CHARS = 6_000_000 // about 4.5 MB of image once decoded

const SYSTEM = `You transcribe photos of a craft brewery's paper brew sheets into JSON. The sheets are printed forms filled in by hand in pen.

Rules that matter more than anything else:
- Transcribe what is written. Never work a value out, never fill a blank from context, never "correct" a number that looks odd.
- If a box is empty, return "" for it (or null for a number in the readings).
- If you cannot read a value with confidence, give your best reading AND add its path to "uncertain". A wrong number recorded as fact is far worse than a flagged one.
- Handwritten decimals are often a mid dot or a faint mark: "5·59" is 5.59, "13 2" in a Plato box is 13.2.
- Printed text is the recipe (what was planned). Handwriting is what happened. Where handwriting crosses out or overwrites print, the handwriting wins.
- A tick beside a line means it was done: "done": true.

Return ONE JSON object and nothing else, in exactly this shape:
{
  "header": { "beer_name": "", "style": "", "brew_date": "YYYY-MM-DD or ''", "tank": "e.g. FV8" },
  "sheet": {
    "brewer": "", "cellar": "", "base_malt_batch": "",
    "malt":             [ { "name": "", "amount": "", "unit": "kg", "when": "", "done": false, "note": "" } ],
    "mash_additions":   [ same line shape, unit usually "g" ],
    "kettle_additions": [ same line shape, "when" is the time column e.g. "15" or "WP @ 85c" ],
    "kettle_hops":      [ same line shape ],
    "dry_hops":         [ same line shape, "when" is the DAY / °P column e.g. "0", "Active", "FG", "Chill"; put a handwritten date in "note" ],
    "mash": { "time": "HH:MM mash-in", "target_temp_c": "", "actual_temp_c": "", "ph": "", "acid": "any lactic acid note, e.g. +100 mL LA" },
    "runnings": { "first": { "time": "", "plato": "", "ph": "" }, "mid": { ... }, "last": { ... } },
    "kettle": { "volume_l": "all in kettle", "boil_start": "HH:MM", "boil_minutes": "", "post_boil_volume_l": "", "post_boil_plato": "", "post_boil_ph": "", "dilution_l": "" },
    "fv": { "temp_c": "", "volume_l": "", "plato": "", "ph": "" },
    "yeast": { "strain": "", "amount": "", "lot": "", "best_before": "", "pitch_temp_c": "", "set_temp_c": "" },
    "signoffs": { "aldc": "initials if the ALDC box is ticked, else ''", "frigid_set": "initials if the FV temp box is ticked, else ''" },
    "notes": "any other handwritten remarks, one per line"
  },
  "readings": [ { "date": "YYYY-MM-DD", "time": "HH:MM or ''", "plato": 0.0, "ph": 0.0, "temp_c": 0.0, "note": "" } ],
  "uncertain": [ "fv.volume_l", "runnings.mid.ph", "readings.3.plato" ]
}

About "readings": this is the FERMENT LOG table. One entry per handwritten row, in order. Dates on the sheet are day and month only ("25.9", "9/10"): use the year from the brew date, rolling into the next year if the log runs past December. Times are written without a colon ("0830", "940", "1220"): return "08:30", "09:40", "12:20". A row that is only words (e.g. "Active DH", "Dropped to 21c", "VDK - on chill") is a note: plato, ph and temp_c are null and the words go in "note".

Every string value is text exactly as written, without units ("12.1", not "12.1°P"). If a second image shows the back of the sheet (transfer and packaging report), ignore it for now.`

interface Body { images?: string[]; brew_day?: string; beer_name?: string }

export async function POST(request: Request) {
  if (!(await staffEmail())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'The AI key is not configured.' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as Body | null
  const images = (body?.images ?? []).filter((s) => typeof s === 'string')
  if (!images.length) return NextResponse.json({ error: 'No photo received.' }, { status: 400 })
  if (images.length > MAX_IMAGES) return NextResponse.json({ error: `Send at most ${MAX_IMAGES} photos at a time.` }, { status: 400 })

  const blocks: Array<{ type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }> = []
  for (const dataUrl of images) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) return NextResponse.json({ error: 'That photo is not in a format the app can read. Try taking it again.' }, { status: 400 })
    if (m[2].length > MAX_IMAGE_CHARS) return NextResponse.json({ error: 'That photo is too large. Try again, or move back a little.' }, { status: 413 })
    blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } })
  }

  const hint = [
    body?.beer_name ? `The app has this brew as "${String(body.beer_name).slice(0, 80)}".` : '',
    body?.brew_day && /^\d{4}-\d{2}-\d{2}$/.test(body.brew_day) ? `The app has its brew day as ${body.brew_day}; use that year if the sheet's date has none.` : '',
  ].filter(Boolean).join(' ')

  let raw = ''
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: `Transcribe this brew sheet. ${hint}`.trim() }] }],
    })
    if (msg.stop_reason === 'max_tokens') return NextResponse.json({ error: 'The sheet was too long to read in one go. Try one page at a time.' }, { status: 502 })
    raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  } catch (err) {
    console.error('[parse-brew-sheet] model call failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The photo could not be read just now. Try again in a moment.' }, { status: 502 })
  }

  let parsed: Record<string, unknown>
  try {
    parsed = extractJsonObject(raw)
  } catch {
    return NextResponse.json({ error: 'The photo was read but the result made no sense. Try a straighter, better-lit photo.' }, { status: 422 })
  }

  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN
    return Number.isFinite(n) ? n : null
  }
  const readings: SheetReading[] = (Array.isArray(parsed.readings) ? parsed.readings : [])
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
    .map((r) => ({
      date: String(r.date ?? ''), time: String(r.time ?? ''),
      plato: num(r.plato), ph: num(r.ph), temp_c: num(r.temp_c),
      note: String(r.note ?? '').slice(0, 300),
    }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (r.plato != null || r.ph != null || r.temp_c != null || r.note.trim()))
    .slice(0, 80)

  const header = (parsed.header && typeof parsed.header === 'object' ? parsed.header : {}) as Record<string, unknown>
  return NextResponse.json({
    header: {
      beer_name: String(header.beer_name ?? '').slice(0, 120),
      brew_date: /^\d{4}-\d{2}-\d{2}$/.test(String(header.brew_date ?? '')) ? String(header.brew_date) : '',
      tank: String(header.tank ?? '').slice(0, 12),
    },
    sheet: sanitiseSheet(parsed.sheet),
    readings,
    uncertain: (Array.isArray(parsed.uncertain) ? parsed.uncertain : []).filter((p): p is string => typeof p === 'string' && /^[a-z_.0-9]+$/.test(p)).slice(0, 100),
  })
}
