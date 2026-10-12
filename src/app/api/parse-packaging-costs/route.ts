import { NextResponse } from 'next/server'
import { staffEmail } from '@/lib/planner/session'
import {
  fileToContent, createMessageWithPDF, createMessageStreamed, isPDF, extractJsonArray,
} from '@/lib/claude'

const SYSTEM = `You are a brewery packaging cost parser. Extract every packaging or
per-unit cost line from the document. This is NOT about beer ingredients — ignore
malt, hops, yeast and brewing additions entirely.

Return ONLY a valid JSON array, no markdown, no explanation. Each object:
{
  "name": "cost line name, e.g. 440mL can",
  "category": "can|end|carton|can_label|carton_label|collar|decal|clip|gas|other",
  "price": 0.37,
  "unit": "each",
  "supplier": "supplier name or null",
  "qty_16x440": 16,
  "qty_24x375": null,
  "qty_keg30": null,
  "qty_keg50": null,
  "notes": "anything qualifying the price, or null"
}

Rules:
- "price" is the cost of ONE item, not the line subtotal. If the document shows
  units, unit price and a subtotal, take the unit price. If it shows only a
  subtotal and a unit count, divide.
- The qty_* fields are how many of this item ONE carton or ONE keg consumes.
  A 16-pack carton uses 16 cans, so qty_16x440 is 16. A box is 1. Use null for
  formats the document does not cover. Never copy a quantity across to a format
  the document is silent on.
- Column headings like "CANNING COSTS (16pk)" tell you the format applies to
  qty_16x440. "24x375" or "24pk" means qty_24x375.
- If a price is stated as including a reject or wastage allowance, keep the
  inclusive figure and say so in notes.
- Include freight, cold storage, levies, licence fees and packing fees. They are
  real per-unit costs. Use category "other" for those.
- Exclude excise duty entirely. It is handled separately.
- Exclude wholesale or retail selling prices, margins and profit lines.
- If a price is missing, use null rather than guessing.`

/** Turn a normal Google Sheets link into a CSV export URL. */
function sheetCsvUrl(raw: string): string | null {
  const m = raw.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return null
  const gid = raw.match(/[#&?]gid=(\d+)/)?.[1] ?? '0'
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`
}

function isPublishedSheet(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname === 'docs.google.com' && u.pathname.startsWith('/spreadsheets/')
  } catch {
    return false
  }
}

// Claude can take a few minutes on a long price list
export const maxDuration = 300

// Bigger than any real brew sheet or price list, small enough to refuse a mistake
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export async function POST(request: Request) {
  if (!(await staffEmail())) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null

  if (file && file.size > MAX_UPLOAD_BYTES) {

    return NextResponse.json({ error: 'That file is over 20 MB. Export a smaller PDF or paste the text.' }, { status: 413 })

  }
  const url = (formData.get('url') as string | null)?.trim()
  const prompt = 'Extract every packaging and per-unit cost line from this document.'

  let raw: string

  try {
    if (url) {
      // Only Google Sheets. Fetching whatever is pasted would let this server be
      // pointed at any address, including ones only it can reach.
      const csvUrl = sheetCsvUrl(url) ?? (isPublishedSheet(url) ? url : null)
      if (!csvUrl) {
        return NextResponse.json({ error: 'Paste a Google Sheets link (docs.google.com/spreadsheets/...).' }, { status: 400 })
      }
      const res = await fetch(csvUrl, { redirect: 'follow', signal: AbortSignal.timeout(20000) })
      const text = await res.text()

      // A private sheet returns Google's sign-in page, not CSV.
      if (!res.ok || /^\s*</.test(text) || text.includes('<!DOCTYPE')) {
        return NextResponse.json({
          error:
            'That sheet is not readable without signing in. In Google Sheets use ' +
            'File > Share > Publish to web, choose the Costs tab and CSV, then paste ' +
            'that link. Or set link sharing to "Anyone with the link can view".',
        }, { status: 403 })
      }
      if (text.trim().length === 0) {
        return NextResponse.json({ error: 'That sheet tab came back empty.' }, { status: 422 })
      }

      raw = await createMessageStreamed({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: SYSTEM,
        messages: [{ role: 'user', content: `${prompt}\n\n${text.slice(0, 200_000)}` }],
      })
    } else if (file && file.size > 0) {
      if (isPDF(file)) {
        const bytes = await file.arrayBuffer()
        raw = await createMessageWithPDF({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: SYSTEM,
          prompt,
          pdfBase64: Buffer.from(bytes).toString('base64'),
        })
      } else {
        raw = await createMessageStreamed({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: SYSTEM,
          messages: [{ role: 'user', content: await fileToContent(file, prompt) }],
        })
      }
    } else {
      return NextResponse.json({ error: 'Provide a file or a sheet link' }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Could not read that: ${msg}` }, { status: 502 })
  }

  try {
    return NextResponse.json({ items: extractJsonArray(raw) })
  } catch {
    return NextResponse.json({ error: 'Could not parse the response', raw }, { status: 422 })
  }
}
