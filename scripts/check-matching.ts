/**
 * Dry run of the ingredient matcher against the live library.
 * Reports what would auto-link, what needs a human, and what has no candidate.
 * Read-only — writes nothing.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { findCandidates, isConfidentMatch } from '../src/lib/matching'
import type { LibraryEntry } from '../src/lib/matching'

config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  const { data: ing } = await supabase
    .from('ingredients')
    .select('id, name, category, ingredient_prices(price_per_unit, unit, supplier, producer, is_preferred)')
    .is('deleted_at', null)

  const library: LibraryEntry[] = (ing ?? []).map((i: any) => {
    const prices = i.ingredient_prices ?? []
    const priced = prices.filter((p: any) => p.price_per_unit != null)
    const chosen = prices.find((p: any) => p.is_preferred) ?? priced[0] ?? prices[0]
    return {
      id: i.id, name: i.name, category: i.category,
      producer: chosen?.producer ?? null,
      supplier: chosen?.supplier ?? null,
      pricePerUnit: chosen?.price_per_unit != null ? Number(chosen.price_per_unit) : null,
      unit: chosen?.unit ?? null,
    }
  })

  const priced = library.filter((l) => l.pricePerUnit != null)
  console.log(`Library: ${library.length} ingredients, ${priced.length} priced\n`)

  const { data: rows } = await supabase
    .from('recipe_ingredients')
    .select('id, name, category, quantity, unit, ingredient_id, recipes(name)')
    .order('sort_order')

  // Only priced entries are useful targets for costing.
  let auto = 0, review = 0, none = 0
  const lines: string[] = []

  for (const r of (rows ?? []) as any[]) {
    const cands = findCandidates(r.name, r.category, priced)
    const top = cands[0]
    const confident = isConfidentMatch(cands)
    if (confident) auto++
    else if (top) review++
    else none++

    const mark = confident ? 'AUTO  ' : top ? 'REVIEW' : 'NONE  '
    const best = top
      ? `${top.name}  [${top.score.toFixed(2)}]  $${top.pricePerUnit}/${top.unit}  ${top.supplier ?? ''}`
      : '—'
    lines.push(`${mark} ${r.name.padEnd(42)} -> ${best}`)
  }

  console.log(lines.join('\n'))
  const total = auto + review + none
  console.log(`\nAuto-link: ${auto}/${total}   Needs review: ${review}   No candidate: ${none}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
