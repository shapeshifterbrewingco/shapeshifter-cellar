'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, Pencil } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { savePackagingReport } from './actions'
import { doRange } from '@/lib/history'
import type { PackReport } from '@/lib/history'
import { PackPhotos } from '@/components/packaging/PackPhotos'
import { shrinkPhoto } from '@/lib/shrink-photo'
import { readPackSheet, sameBeer } from '@/lib/pack-sheet'

const EMPTY: PackReport = {
  best_before: null, bbt_temp_c: null, bbt_co2_vol: null, bbt_do_ppb: null, bbt_do_ppb_high: null, pack_co2_vol: null, pack_do_ppb: null, pack_do_ppb_high: null, unders: null,
  stock_venue_kegs: null, stock_venue_cartons: null, stock_options_kegs: null, stock_options_cartons: null,
  stock_sales_kegs: null, stock_sales_cartons: null, notes: null,
}

type Key = keyof PackReport
const MEASURES: { key: Key; label: string; unit: string; whole?: boolean }[] = [
  { key: 'bbt_temp_c',   label: 'Brite temp', unit: '°C' },
  { key: 'bbt_co2_vol',  label: 'Brite CO2',  unit: 'vol' },
  { key: 'bbt_do_ppb',       label: 'Brite DO low',  unit: 'ppb' },
  { key: 'bbt_do_ppb_high',  label: 'Brite DO high', unit: 'ppb' },
  { key: 'pack_co2_vol',     label: 'Pack CO2',      unit: 'vol' },
  { key: 'pack_do_ppb',      label: 'Pack DO low',   unit: 'ppb' },
  { key: 'pack_do_ppb_high', label: 'Pack DO high',  unit: 'ppb' },
]
// How the same readings are shown once saved: a DO low and high read as one range
const SHOWN = (r: PackReport): [string, string][] => [
  ['Brite temp', show(r.bbt_temp_c, '°C')],
  ['Brite CO2', show(r.bbt_co2_vol, 'vol')],
  ['Brite DO', doRange(r.bbt_do_ppb, r.bbt_do_ppb_high)],
  ['Pack CO2', show(r.pack_co2_vol, 'vol')],
  ['Pack DO', doRange(r.pack_do_ppb, r.pack_do_ppb_high)],
]
const STOCK: { where: string; kegs: Key; cartons: Key }[] = [
  { where: 'At venue',       kegs: 'stock_venue_kegs',   cartons: 'stock_venue_cartons' },
  { where: 'At Options',     kegs: 'stock_options_kegs', cartons: 'stock_options_cartons' },
  { where: 'Taken by sales', kegs: 'stock_sales_kegs',   cartons: 'stock_sales_cartons' },
]

const INPUT = 'w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30'
// A value read off a photo that nobody has confirmed yet
const UNSURE = 'bg-yeast/40 border-yeast'
const show = (v: number | string | null, unit = '') => (v == null || v === '' ? '-' : `${v}${unit ? ` ${unit}` : ''}`)
const toDraft = (r: PackReport) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? '' : String(v)])) as Record<Key, string>

/** The packaging report for one batch and its photos. */
export function PackReportPanel({ brewId, beerName, report }: { brewId: string; beerName: string; report: PackReport | null }) {
  return (
    <div className="space-y-3">
      <ReportBody brewId={brewId} beerName={beerName} report={report} />
      <PackPhotos brewId={brewId} />
    </div>
  )
}

/** The report itself: read by default, a form when Edit is tapped. */
function ReportBody({ brewId, beerName, report }: { brewId: string; beerName: string; report: PackReport | null }) {
  const [saved, setSaved] = useState<PackReport>(report ?? EMPTY)
  const [draft, setDraft] = useState<Record<Key, string> | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fill from a photo of the paper report. Opens the form with empty boxes
  // filled in; nothing is saved until Save report.
  const [reading, setReading] = useState(false)
  const [unsure, setUnsure] = useState<Set<string>>(new Set())
  const sheetInput = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(toDraft(saved))
  }

  async function readSheet(files: FileList | null) {
    const file = files?.[0]
    if (!file || reading) return
    setReading(true)
    try {
      const r = await readPackSheet([await shrinkPhoto(file)], { beer_name: beerName })
      const before = draft ?? toDraft(saved)
      const filled = new Set<string>()
      for (const k of Object.keys(EMPTY) as Key[]) {
        const v = r[k]
        if (v != null && v !== '' && !before[k].trim()) filled.add(k)
      }
      // Typed entries win, even ones typed while the photo was being read
      setDraft((d) => {
        const next = { ...(d ?? before) }
        for (const k of filled as Set<Key>) if (!next[k].trim()) next[k] = String(r[k])
        return next
      })
      setUnsure(new Set(r.uncertain.filter((k) => filled.has(k))))
      if (!sameBeer(r.beer_name, beerName)) {
        toast.warning(`That sheet says "${r.beer_name}", but this is ${beerName}. Check it is the right sheet.`, { duration: 12000 })
      }
      const flagged = r.uncertain.filter((k) => filled.has(k)).length
      toast.success(!filled.size
        ? 'Report read, but there were no empty boxes it could fill.'
        : flagged ? `Report read. ${flagged} value${flagged === 1 ? '' : 's'} highlighted to check.` : 'Report read. Check it over, then save.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The photo could not be read.')
    } finally {
      setReading(false)
      if (sheetInput.current) sheetInput.current.value = ''
    }
  }

  const photoButton = (
    <>
      <input ref={sheetInput} type="file" accept="image/*" className="hidden" onChange={(e) => void readSheet(e.target.files)} />
      <button type="button" onClick={() => sheetInput.current?.click()} disabled={reading || isPending} className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60">
        {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}{reading ? 'Reading…' : 'From photo'}
      </button>
    </>
  )

  function save() {
    if (!draft) return
    const next = { ...EMPTY } as Record<Key, string | number | null>
    for (const k of Object.keys(EMPTY) as Key[]) {
      const raw = draft[k].trim()
      if (!raw) continue
      next[k] = k === 'best_before' || k === 'unders' || k === 'notes' ? raw : Number(raw)
    }
    startTransition(async () => {
      const res = await savePackagingReport(brewId, next as unknown as PackReport).catch(() => ({ ok: false, message: 'Could not reach the app.' }))
      if (!res.ok) { toast.error(`Not saved. ${res.message ?? ''}`.trim()); return }
      setSaved(next as unknown as PackReport)
      setDraft(null)
      setUnsure(new Set())
      toast.success('Packaging report saved')
    })
  }

  const set = (k: Key, v: string) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d))
    setUnsure((s) => {
      if (!s.has(k)) return s
      const next = new Set(s)
      next.delete(k)
      return next
    })
  }
  const cls = (k: Key, base = INPUT) => (unsure.has(k) ? `${base} ${UNSURE}` : base)
  const empty = Object.values(saved).every((v) => v == null || v === '')

  if (!draft) {
    return (
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-gray-500">Packaging report</h3>
          <div className="flex items-center gap-4">
            {photoButton}
            <button type="button" onClick={startEdit} disabled={reading} className="inline-flex items-center gap-1 text-xs font-semibold text-primary disabled:opacity-60">
              <Pencil className="h-3.5 w-3.5" />{empty ? 'Fill in' : 'Edit'}
            </button>
          </div>
        </div>
        {empty ? (
          <p className="text-sm text-gray-400">Nothing recorded yet. Brite and pack DO, CO2, best before and where the stock went.</p>
        ) : (
          <div className="rounded-xl bg-white ring-1 ring-black/5 text-sm divide-y divide-gray-100">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 px-3 py-2.5">
              {SHOWN(saved).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] text-gray-400">{label}</dt>
                  <dd className="font-semibold tabular-nums text-gray-900">{value}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[11px] text-gray-400">Best before</dt>
                <dd className="font-semibold tabular-nums text-gray-900">{saved.best_before ? format(parseISO(saved.best_before), 'd MMM yyyy') : '-'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-gray-400">Unders / SOR</dt>
                <dd className="font-semibold text-gray-900 break-words">{show(saved.unders)}</dd>
              </div>
            </dl>
            {STOCK.some((s) => saved[s.kegs] != null || saved[s.cartons] != null) && (
              <ul className="px-3 py-2.5 space-y-1">
                {STOCK.map((s) => (
                  <li key={s.where} className="flex items-baseline justify-between gap-3">
                    <span className="text-gray-500">{s.where}</span>
                    <span className="tabular-nums text-gray-900">{show(saved[s.cartons])} cartons · {show(saved[s.kegs])} kegs</span>
                  </li>
                ))}
              </ul>
            )}
            {saved.notes && <p className="px-3 py-2.5 text-gray-600 whitespace-pre-wrap break-words">{saved.notes}</p>}
          </div>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500">Packaging report</h3>
        {photoButton}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {MEASURES.map((m) => (
          <label key={m.key} className="block min-w-0">
            <span className="block text-xs text-gray-500 mb-1">{m.label} ({m.unit})</span>
            <input type="number" inputMode="decimal" step={m.whole ? '1' : '0.01'} min={m.key === 'bbt_temp_c' ? undefined : '0'} value={draft[m.key]} onChange={(e) => set(m.key, e.target.value)} className={cls(m.key)} />
          </label>
        ))}
        <label className="block min-w-0">
          <span className="block text-xs text-gray-500 mb-1">Best before</span>
          <input type="date" value={draft.best_before} onChange={(e) => set('best_before', e.target.value)} className={cls('best_before', `${INPUT} min-w-0 appearance-none`)} />
        </label>
        <label className="block min-w-0 col-span-2 sm:col-span-3">
          <span className="block text-xs text-gray-500 mb-1">Unders / SOR</span>
          <input type="text" value={draft.unders} onChange={(e) => set('unders', e.target.value)} className={cls('unders')} />
        </label>
      </div>

      <div>
        <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center text-xs text-gray-500 mb-1">
          <span>Where the stock went</span><span>Cartons</span><span>Kegs</span>
        </div>
        {STOCK.map((s) => (
          <div key={s.where} className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center mb-2">
            <span className="text-sm text-gray-700">{s.where}</span>
            <input type="number" inputMode="decimal" step="any" min="0" aria-label={`${s.where} cartons`} value={draft[s.cartons]} onChange={(e) => set(s.cartons, e.target.value)} className={cls(s.cartons)} />
            <input type="number" inputMode="decimal" step="any" min="0" aria-label={`${s.where} kegs`} value={draft[s.kegs]} onChange={(e) => set(s.kegs, e.target.value)} className={cls(s.kegs)} />
          </div>
        ))}
      </div>

      <label className="block">
        <span className="block text-xs text-gray-500 mb-1">Notes</span>
        <textarea rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={cls('notes', `${INPUT} h-auto py-2`)} />
      </label>

      <div className="flex gap-2">
        <button type="button" onClick={() => { setDraft(null); setUnsure(new Set()) }} disabled={isPending} className="flex-1 h-11 rounded-xl ring-1 ring-black/10 text-sm font-medium text-gray-700">Cancel</button>
        <button type="button" onClick={save} disabled={isPending || reading} className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save report
        </button>
      </div>
    </section>
  )
}
