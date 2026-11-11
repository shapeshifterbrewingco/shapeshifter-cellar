// Reads a photo of the paper packaging report into the Package form's fields.
// Nothing is saved here: the result goes back to the form for a person to
// check before it is logged.

import { NextResponse } from 'next/server'
import { anthropic, extractJsonObject } from '@/lib/claude'
import { staffEmail } from '@/lib/planner/session'
import { sanitisePackSheet } from '@/lib/pack-sheet'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Same reasoning as the brew sheet: handwriting is the hard part, and it runs once per batch.
const MODEL = process.env.PACK_SHEET_MODEL || process.env.BREW_SHEET_MODEL || 'claude-opus-5-5'
const MAX_IMAGES = 2
const MAX_IMAGE_CHARS = 6_000_000 // about 4.5 MB of image once decoded

const SYSTEM = `You transcribe a photo of a craft brewery's paper packaging report into JSON. The page is a printed form filled in by hand in pen. The top half of the page is usually a Transfer Report: ignore it completely. Read only the section headed "Packaging Report".

Rules that matter more than anything else:
- Transcribe what is written. Never work a value out, never fill a blank from context, never "correct" a number that looks odd. Never calculate cartons or kegs from the litres total, or the other way round.
- An empty box, a dash ("-", "—") or a line through a box means nothing was written: return null (or "" for text).
- If you cannot read a value with confidence, give your best reading AND add its key to "uncertain". A wrong number recorded as fact is far worse than a flagged one.
- Handwritten decimals are often a mid dot or a faint mark: "2·79" is 2.79, "0·8" is 0.8. Keep a minus sign on a temperature: "-0.5" is -0.5.
- Dates are Australian, day first: "11.11.26" and "11/11/26" are 2026-11-11.

The form, and the key for each box:
- Beer name, Packaging date, Batch no, Best before: beer_name, packaging_date, batch_code, best_before
- BBT Temp (C), BBT CO2 (vol), BBT DO (ppb): bbt_temp_c, bbt_co2_vol, bbt_do_ppb
- Can CO2 (vol), Can DO (ppb), Unders/SOR: pack_co2_vol, pack_do_ppb, unders
- A DO written as a range, e.g. "48-58", is low then high: 48 in the _do_ppb key, 58 in the matching _do_ppb_high key. A single DO goes in the low key and the high key is null. DO is read to one decimal place at most, so two whole numbers joined by any short mark ("59·67", "48-58", "48/58") are a range, not a decimal.
- Unders/SOR is text: copy it with any word written beside the box, e.g. "2.5 cartons".
- Packaged Kegs has two rows, 30L then 50L: qty_keg30, qty_keg50
- Packaged Cartons has two rows, 16x440mL then 24x375mL: qty_16x440, qty_24x375. Part cartons are written as decimals, e.g. 121.75.
- Litres packed total: litres_total
- The stock table has rows "Stock at venue", "Stock at Options", "Stock taken by sales" and columns KEGS then CARTONS: stock_venue_kegs, stock_venue_cartons, stock_options_kegs, stock_options_cartons, stock_sales_kegs, stock_sales_cartons
- The NOTES box under the packaging report: notes. Then add, each on its own line, any handwriting about the packaging that sits outside a box, saying what it sits beside, e.g. "50L kegs: + 1x partial" or "Litres: incl partial". Leave out margin working, such as a litres sum written beside a carton count.

If the photo does not show the Packaging Report form (a keg collar, cartons, a can), return {"not_a_report": true} and nothing else.

Otherwise return ONE JSON object and nothing else, in exactly this shape, numbers as JSON numbers:
{
  "beer_name": "", "packaging_date": "YYYY-MM-DD or ''", "batch_code": "", "best_before": "YYYY-MM-DD or ''",
  "bbt_temp_c": null, "bbt_co2_vol": null, "bbt_do_ppb": null, "bbt_do_ppb_high": null,
  "pack_co2_vol": null, "pack_do_ppb": null, "pack_do_ppb_high": null, "unders": "",
  "qty_keg30": null, "qty_keg50": null, "qty_16x440": null, "qty_24x375": null, "litres_total": null,
  "stock_venue_kegs": null, "stock_venue_cartons": null, "stock_options_kegs": null, "stock_options_cartons": null,
  "stock_sales_kegs": null, "stock_sales_cartons": null,
  "notes": "",
  "uncertain": [ "bbt_do_ppb" ]
}`

interface Body { images?: string[]; beer_name?: string; batch_code?: string | null }

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
    body?.beer_name ? `The app has this batch as "${String(body.beer_name).slice(0, 80)}".` : '',
    body?.batch_code ? `Its batch number in the app is ${String(body.batch_code).slice(0, 20)}.` : '',
    'Transcribe what the sheet says even where it differs from the app.',
  ].filter(Boolean).join(' ')

  let raw = ''
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [...blocks, { type: 'text', text: `Transcribe this packaging report. ${hint}` }] }],
    })
    raw = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  } catch (err) {
    console.error('[parse-pack-sheet] model call failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The photo could not be read just now. Try again in a moment.' }, { status: 502 })
  }

  let parsed: Record<string, unknown>
  try {
    parsed = extractJsonObject(raw)
  } catch {
    return NextResponse.json({ error: 'The photo was read but the result made no sense. Try a straighter, better-lit photo.' }, { status: 422 })
  }
  if (parsed.not_a_report) return NextResponse.json({ error: 'That photo does not show the packaging report. Take one of the paper sheet.' }, { status: 422 })
  return NextResponse.json(sanitisePackSheet(parsed))
}
