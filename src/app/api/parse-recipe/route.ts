import { NextResponse } from 'next/server'
import { fileToContent, createMessageWithPDF, createMessageStreamed, isPDF, extractJsonObject } from '@/lib/claude'

const SYSTEM = `You are a brewing recipe parser. Extract all information from the brew sheet or recipe document.
Return ONLY a single valid JSON object — no markdown, no explanation:
{
  "name": "recipe name",
  "style": "beer style string",
  "target_abv": 5.2,
  "target_og_plato": 12.5,
  "target_fg_plato": 3.0,
  "target_ibu": 35,
  "target_ebc": 12,
  "brew_volume_l": 2000,
  "foundation_l": null,
  "sparge_l": null,
  "boil_duration_min": 60,
  "mash_temp_c": 67,
  "pitch_temp_c": 18,
  "ferment_temp_c": 19,
  "notes": "any relevant notes",
  "ingredients": [
    {
      "name": "ingredient name",
      "category": "malt|hop|yeast|adjunct|finings|water_treatment|other",
      "addition_stage": "malt|mash_addition|mash_hop|kettle_addition|kettle_hop|dry_hop|yeast|process",
      "quantity": 250.0,
      "unit": "kg",
      "time_minutes": null,
      "trigger": null
    }
  ]
}
Use null for any fields not found. For addition_stage: "malt" for base malts/grains, "mash_hop" for first wort/mash hops, "kettle_hop" for bittering/flavour hops with time, "dry_hop" for post-fermentation hops, "yeast" for yeast. Include ALL ingredients.`

export interface ParsedRecipe {
  name: string
  style: string | null
  target_abv: number | null
  target_og_plato: number | null
  target_fg_plato: number | null
  target_ibu: number | null
  target_ebc: number | null
  brew_volume_l: number | null
  foundation_l: number | null
  sparge_l: number | null
  boil_duration_min: number | null
  mash_temp_c: number | null
  pitch_temp_c: number | null
  ferment_temp_c: number | null
  notes: string | null
  ingredients: {
    name: string
    category: string
    addition_stage: string
    quantity: number | null
    unit: string | null
    time_minutes: number | null
    trigger: string | null
  }[]
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
        max_tokens: 4096,
        system: SYSTEM,
        prompt: 'Parse this brewing recipe/brew sheet document.',
        pdfBase64: base64,
      })
    } else {
      const content = await fileToContent(file, 'Parse this brewing recipe/brew sheet document.')
      raw = await createMessageStreamed({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `AI call failed: ${msg}` }, { status: 502 })
  }

  let recipe: ParsedRecipe
  try {
    recipe = extractJsonObject(raw) as unknown as ParsedRecipe
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response', raw }, { status: 422 })
  }

  return NextResponse.json({ recipe })
}
