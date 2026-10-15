// The packaging report as a post in #packagingreports: beer, batch, what was
// packed, where the stock went, QC, notes and the photos. Posted when a batch
// is packaged, and edited in place when the report or its photos change later.

import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { APP_URL, esc, who } from '@/lib/slack'
import { botConfigured, postOrUpdate, uploadImage } from '@/lib/slack-bot'
import type { Block } from '@/lib/slack-bot'
import { BREWERY_TZ } from '@/lib/dates'
import { DO_SPEC, doRange, doWorst } from '@/lib/history'
import type { PackReport } from '@/lib/history'

export const PHOTO_BUCKET = 'pack-photos'

/** Reports filled in from History post only if the batch was packaged this recently. Older ones are back-filling. */
const POST_WINDOW_DAYS = 7

export interface PackRun { format: string; qty: number; volume_l: number; packaged_by: string | null; packaged_at: string }

const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v))
const qtyText = (n: number) => String(Math.round(n * 100) / 100)
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const KEGS: Record<string, string> = { keg50: '50 L', keg30: '30 L', keg20: '20 L PET' }

function formatLine(format: string, qty: number): string {
  const size = KEGS[format]
  if (!size) return `${qtyText(qty)} x ${format} ${plural(qty, 'carton', 'cartons')}`
  // A part-filled keg is logged as a fraction (0.8 of a keg): say so, not "22.8 kegs"
  const whole = Math.floor(qty + 1e-9)
  const partial = qty - whole > 0.01
  if (!whole) return `1 partial ${size} keg`
  return `${whole} x ${size} ${plural(whole, 'keg', 'kegs')}${partial ? ' + 1 partial' : ''}`
}

const FORMAT_ORDER = ['keg50', 'keg30', 'keg20', '24x375', '16x440']

function stockPart(where: string, kegs: number | null, cartons: number | null): string | null {
  const bits = [
    kegs ? `${qtyText(kegs)} ${plural(kegs, 'keg', 'kegs')}` : null,
    cartons ? `${qtyText(cartons)} ctn` : null,
  ].filter(Boolean)
  return bits.length ? `${where} ${bits.join(', ')}` : null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Wed 23 Sep", or "23 Sep 2027" with the year, in brewery time. (en-AU would say "Sept".) */
function day(iso: string, withYear = false): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: BREWERY_TZ, weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const date = `${Number(get('day'))} ${MONTHS[Number(get('month')) - 1]}`
  return withYear ? `${date} ${get('year')}` : `${get('weekday')} ${date}`
}

/** Over the DO limit History uses, said plainly after the reading. */
function doText(low: number | null, high: number | null, spec: number): string {
  const worst = doWorst(low, high)
  return `DO ${doRange(low, high)}${worst != null && worst > spec ? ` *(over the ${spec} ppb limit)*` : ''}`
}

/** The message, without the photos. Lines with nothing recorded are left out. */
export function packReportMessage(input: {
  beer_name: string
  style: string | null
  batch_code: string | null
  posted_by: string
  packaged_at: string
  runs: PackRun[]
  report: Partial<PackReport> | null
}): { text: string; blocks: Block[] } {
  const r = input.report ?? {}
  const title = [`*${esc(input.beer_name)}*`, input.style ? ` - ${esc(input.style)}` : '', input.batch_code ? ` | Batch ${esc(input.batch_code)}` : ''].join('')
  const byLine = [`Posted by ${esc(input.posted_by)}, ${day(input.packaged_at)}`,
    r.best_before ? `Best before ${day(r.best_before, true)}` : null,
  ].filter(Boolean).join(' · ')

  const lines: string[] = [title, byLine, '']

  const totals = new Map<string, number>()
  for (const run of input.runs) totals.set(run.format, (totals.get(run.format) ?? 0) + Number(run.qty))
  const litres = input.runs.reduce((s, run) => s + Number(run.volume_l), 0)
  const packed = [...totals.entries()]
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => FORMAT_ORDER.indexOf(a) - FORMAT_ORDER.indexOf(b))
    .map(([f, q]) => formatLine(f, q))
  if (packed.length) lines.push(`*Packed:* ${packed.join(', ')} · ${Math.round(litres).toLocaleString('en-AU')} L`)

  const stock = [
    stockPart('Options', num(r.stock_options_kegs), num(r.stock_options_cartons)),
    stockPart('Venue', num(r.stock_venue_kegs), num(r.stock_venue_cartons)),
    stockPart('Sales', num(r.stock_sales_kegs), num(r.stock_sales_cartons)),
  ].filter(Boolean)
  if (stock.length) lines.push(`*Stock:* ${stock.join(' · ')}`)

  const brite = [
    num(r.bbt_temp_c) != null ? `${num(r.bbt_temp_c)}°C` : null,
    num(r.bbt_co2_vol) != null ? `CO2 ${num(r.bbt_co2_vol)} vol` : null,
    num(r.bbt_do_ppb) != null || num(r.bbt_do_ppb_high) != null ? doText(num(r.bbt_do_ppb), num(r.bbt_do_ppb_high), DO_SPEC.brite) : null,
  ].filter(Boolean)
  if (brite.length) lines.push(`*Brite:* ${brite.join(' · ')}`)

  const pack = [
    num(r.pack_co2_vol) != null ? `CO2 ${num(r.pack_co2_vol)} vol` : null,
    num(r.pack_do_ppb) != null || num(r.pack_do_ppb_high) != null ? doText(num(r.pack_do_ppb), num(r.pack_do_ppb_high), DO_SPEC.pack) : null,
  ].filter(Boolean)
  if (pack.length) lines.push(`*Pack:* ${pack.join(' · ')}`)

  if (r.unders) lines.push(`*Unders/SOR:* ${esc(String(r.unders))}`)
  if (r.notes) lines.push(`*Notes:* ${esc(String(r.notes)).slice(0, 1500)}`)

  lines.push('', `<${APP_URL}/history|Open in Cellar>`)

  return {
    text: `Packaging report: ${input.beer_name}${input.batch_code ? ` batch ${input.batch_code}` : ''}`,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } }],
  }
}

/**
 * Post the report for one batch, or update its post. `create` is for the
 * moment of packaging; otherwise a post is only made if the batch is recent.
 */
export async function publishPackReport(brewId: string, { create = false, actor }: { create?: boolean; actor?: string | null } = {}) {
  if (!botConfigured()) return
  try {
    const db = createServiceClient()
    const [{ data: brew }, { data: runs }, { data: report }, { data: photos }] = await Promise.all([
      db.from('brews').select('beer_name, style, batch_code').eq('id', brewId).maybeSingle(),
      db.from('packaging_runs').select('format, qty, volume_l, packaged_by, packaged_at').eq('brew_id', brewId).order('packaged_at'),
      db.from('packaging_reports').select('*').eq('brew_id', brewId).maybeSingle(),
      db.from('pack_photos').select('id, path, slack_file_id').eq('brew_id', brewId).order('created_at'),
    ])
    if (!brew || !runs?.length) return

    const ts = (report?.slack_ts as string | null) ?? null
    const packagedAt = runs[0].packaged_at as string
    const recent = Date.now() - new Date(packagedAt).getTime() < POST_WINDOW_DAYS * 86_400_000
    if (!ts && !create && !recent) return

    // Photos go to Slack once; the file ID is kept so later edits reuse it
    const fileIds: string[] = []
    for (const p of photos ?? []) {
      let id = p.slack_file_id as string | null
      if (!id) {
        const { data: blob } = await db.storage.from(PHOTO_BUCKET).download(p.path)
        if (!blob) continue
        id = await uploadImage(new Uint8Array(await blob.arrayBuffer()), `batch-${brew.batch_code ?? 'photo'}-${p.id.slice(0, 6)}.jpg`)
        if (!id) continue
        await db.from('pack_photos').update({ slack_file_id: id }).eq('id', p.id)
      }
      fileIds.push(id)
    }

    const runBy = runs.find((x) => x.packaged_by && String(x.packaged_by).includes('@'))?.packaged_by as string | undefined
    const { text, blocks } = packReportMessage({
      beer_name: brew.beer_name,
      style: brew.style,
      batch_code: brew.batch_code,
      posted_by: who(runBy ?? actor ?? (report?.updated_by as string | null)),
      packaged_at: packagedAt,
      runs: runs as PackRun[],
      report: report as Partial<PackReport> | null,
    })
    const imageBlocks = fileIds.map((id) => ({ type: 'image', slack_file: { id }, alt_text: `${brew.beer_name} packaging photo` }))

    const newTs = await postOrUpdate({ ts, text, blocks, imageBlocks })
    if (newTs && newTs !== ts) {
      await db.from('packaging_reports').upsert({ brew_id: brewId, slack_ts: newTs }, { onConflict: 'brew_id' })
    }
  } catch (err) {
    console.error('[pack-report-post]', err instanceof Error ? err.message : err)
  }
}

/** Run after the response has gone back, so nobody waits on Slack. */
export function publishPackReportLater(brewId: string, opts: { create?: boolean; actor?: string | null } = {}) {
  if (!botConfigured()) return
  try { after(() => publishPackReport(brewId, opts)) } catch { void publishPackReport(brewId, opts) }
}
