import { NextResponse } from 'next/server'
import { fileToContent, createMessageWithPDF, createMessageStreamed, isPDF, extractJsonArray } from '@/lib/claude'

const SYSTEM = `You are a brewing ingredient price list parser.
Extract every product/ingredient from the supplier document.
Return ONLY a valid JSON array — no markdown, no explanation. Each object:
{
  "name": "product name (variety or type only, without producer prefix)",
  "producer": "who manufactures/grows it (e.g. Weyermann, NZ Hops, Yakima Chief, Lallemand) or null if unknown",
  "price": 12.50,
  "unit": "kg",
  "category": "malt|hop|yeast|adjunct|finings|water_treatment|other",
  "supplier_code": "optional code or null",
  "notes": "optional notes or null"
}
Rules:
- Split producer from name: "Weyermann Carapils" → name "Carapils", producer "Weyermann"
- For hops: producer is the grower/brand (e.g. "NZ Hops", "Freestyle Hops", "Yakima Chief", "Hop Products Australia")
- For malts: producer is the maltster (e.g. "Weyermann", "Joe White", "Barrett Burston", "Thomas Fawcett")
- For yeast: producer is the lab (e.g. "Lallemand", "Fermentis", "White Labs", "Imperial")
- If name includes trademark symbols (™, ®), keep them in the name
- If price is not listed use null. Normalise units to kg/g/L/mL/pkg/each where possible.
- Include every line item — do not skip anything.`

export interface PriceListItem {
  name: string
  producer: string | null
  price: number | null
  unit: string
  category: string
  supplier_code: string | null
  notes: string | null
}

export async function POST(request: Request) {
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
  const supplier = (formData.get('supplier') as string | null)?.trim() || 'Unknown Supplier'

  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  let raw: string

  try {
    if (isPDF(file)) {
      const bytes = await file.arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      raw = await createMessageWithPDF({
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        system: SYSTEM,
        prompt: `Parse this price list from supplier: ${supplier}`,
        pdfBase64: base64,
      })
    } else {
      const content = await fileToContent(file, `Parse this price list from supplier: ${supplier}`)
      raw = await createMessageStreamed({
        model: 'claude-sonnet-4-6',
        max_tokens: 32000,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `AI call failed: ${msg}` }, { status: 502 })
  }

  let items: PriceListItem[]
  try {
    items = extractJsonArray(raw) as PriceListItem[]
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response', raw }, { status: 422 })
  }

  if (items.length === 0) {
    console.error('[parse-price-list] No items extracted. Raw response:', raw.slice(0, 2000))
    return NextResponse.json({
      error: 'No items extracted — see server console for Claude\'s raw response.',
      raw: raw.slice(0, 500),
    }, { status: 422 })
  }

  return NextResponse.json({ items, supplier })
}
