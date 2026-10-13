// Packaged stock goes into the Sales App the same way a person adds it there:
// one row per SKU on its stock_adjustments tab. Needs the service account to
// be an Editor on the Sales App sheet.

import { SALES_SHEET_ID, sheetAppend } from '@/lib/planner/google'
import { getSkuColumns } from '@/lib/planner/sales-app/sheets'
import { brandOf, brandMatches, splitsFormatFor } from '@/lib/planner/sales-app/splits'
import { breweryToday } from '@/lib/dates'

type Col = { code: string; name: string }

// Cellar pack format -> the Sales App's format code
const FORMAT: Record<string, string> = { '24x375': '24PK', '16x440': '16PK', keg20: '20L', keg30: '30L', keg50: '50L' }
const FORMAT_WORDS: Record<string, string> = { '24PK': '24 packs', '16PK': '16 packs', '20L': '20 L kegs', '30L': '30 L kegs', '50L': '50 L kegs' }

/** The one Sales App SKU a beer and pack format belong to, or why there isn't one. */
function skuFor(columns: Col[], beerName: string, style: string | null, fmt: string): { sku: string } | { why: string } {
  const key = brandOf(beerName)
  const hits = columns.filter((c) => splitsFormatFor(c) === fmt && brandMatches(brandOf(c.name), key))
  if (hits.length === 1) return { sku: hits[0].code }
  if (hits.length === 0) return { why: `no ${FORMAT_WORDS[fmt] ?? fmt} SKU for ${beerName}` }
  // Several SKUs share the name (an old recipe and its replacement). Only an exact name settles it.
  const exact = hits.filter((c) => brandOf(c.name) === key)
  if (exact.length === 1) return { sku: exact[0].code }
  // Or the style: "Party Shirt" brewed as a Hazy Pale is the Hazy Pale SKU, not the old Session Hazy
  const want = (style ?? '').trim().toLowerCase()
  const byStyle = want ? hits.filter((c) => c.name.toLowerCase().includes(want)) : []
  return byStyle.length === 1 ? { sku: byStyle[0].code } : { why: `${hits.length} SKUs match ${beerName} in ${FORMAT_WORDS[fmt] ?? fmt}` }
}

/**
 * Add a packaging run to Sales App stock. Never throws: packaging has already
 * happened, so a failure here comes back as a sentence to tell the brewer.
 */
export async function addPackedStock(beerName: string, style: string | null, batchCode: string, packages: { format: string; qty: number }[]): Promise<{ added: string[]; missed: string[] }> {
  const added: string[] = []
  const missed: string[] = []
  try {
    const columns = ((await getSkuColumns()) ?? []) as Col[]
    if (!columns.length) return { added, missed: ['the Sales App SKU list could not be read'] }

    const month = breweryToday().slice(0, 7)
    const stamp = new Date().toISOString()
    const rows: (string | number)[][] = []
    for (const p of packages) {
      const fmt = FORMAT[p.format]
      if (!fmt || !(p.qty > 0)) continue
      const hit = skuFor(columns, beerName, style, fmt)
      if ('why' in hit) { missed.push(hit.why); continue }
      rows.push([hit.sku, month, p.qty, stamp, `Packed in Cellar, batch ${batchCode}`])
      added.push(`${p.qty} x ${hit.sku}`)
    }
    if (rows.length) await sheetAppend(SALES_SHEET_ID, 'stock_adjustments!A:E', rows)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sales-stock] not added:', message)
    return { added: [], missed: [/\b403\b/.test(message) ? 'Cellar does not have edit access to the Sales App sheet' : 'the Sales App sheet could not be written to'] }
  }
  return { added, missed }
}
