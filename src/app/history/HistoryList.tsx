'use client'

import { logDayTime } from '@/lib/log-date'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronDown, ClipboardList, Loader2, Pencil, Search, Trash2, X } from 'lucide-react'
import { format, parseISO, differenceInDays } from 'date-fns'
import { deleteBrewHistory, loadBrewDetail } from './actions'
import { yearBg } from './year-colour'
import { EditBrewModal } from './EditBrewModal'
import type { BrewHistoryItem, BrewReading, PackagingRun, PackCounts, VdkEntry } from '@/lib/history'
import { PackReportPanel } from './PackReportPanel'
import { doRange } from '@/lib/history'
import { VDK_STYLE, withVdk } from '@/lib/vdk'
import { PACKAGE_FORMATS } from '@/types'
import { formatUserName } from '@/lib/utils'

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'

const plural = (n: number, word: string) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`

/** "86 cartons · 12 kegs", or null when nothing was packed. */
function packedSummary(p: PackCounts): string | null {
  const cartons = p.c24 + p.c16
  const kegs = p.keg20 + p.keg30 + p.keg50
  if (!cartons && !kegs) return null
  return [cartons > 0 && plural(cartons, 'carton'), kegs > 0 && plural(kegs, 'keg')].filter(Boolean).join(' · ')
}

const daysLabel = (n: number | null) => (n == null ? '-' : n === 1 ? '1 day' : `${n} days`)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
const litres = (n: number) => `${Math.round(n).toLocaleString('en-AU')} L`
const day = (iso: string) => format(parseISO(iso), 'd MMM yyyy')

type Detail = { readings: BrewReading[]; packaging_runs: PackagingRun[]; vdk: VdkEntry[] }

/** Which part of a batch matched the search, so a hop search says which hop. */
function matchReason(item: BrewHistoryItem, q: string): string | null {
  const has = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q)
  if (has(item.beer_name) || has(item.batch_code)) return ''
  const hop = item.hops.find(has)
  if (hop) return `Hop: ${hop}`
  const yeast = item.yeast.find(has)
  if (yeast) return `Yeast: ${yeast}`
  if (has(item.style)) return ''
  if (has(item.tank_name)) return ''
  if (has(item.notes)) return 'In the notes'
  return null
}

export function HistoryList({ items }: { items: BrewHistoryItem[] }) {
  const [search, setSearch] = useState('')
  // The newest month starts open; the rest wait to be tapped
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set(items[0] ? [items[0].month] : []))
  const [openBrew, setOpenBrew] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, Detail | 'loading' | 'error'>>({})
  const [editItem, setEditItem] = useState<BrewHistoryItem | null>(null)
  const [, startTransition] = useTransition()

  const q = search.trim().toLowerCase()

  const months = useMemo(() => {
    const map = new Map<string, BrewHistoryItem[]>()
    for (const it of items) map.set(it.month, [...(map.get(it.month) ?? []), it])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  const results = useMemo(() => {
    if (!q) return null
    return items
      .map((item) => ({ item, why: matchReason(item, q) }))
      .filter((r): r is { item: BrewHistoryItem; why: string } => r.why !== null)
  }, [items, q])

  function loadDetail(id: string) {
    if (details[id] && details[id] !== 'error') return
    setDetails((d) => ({ ...d, [id]: 'loading' }))
    loadBrewDetail(id)
      .then((detail) => setDetails((d) => ({ ...d, [id]: detail })))
      .catch(() => setDetails((d) => ({ ...d, [id]: 'error' })))
  }

  function toggleBrew(id: string) {
    if (openBrew === id) { setOpenBrew(null); return }
    setOpenBrew(id)
    loadDetail(id)
  }

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function edit(item: BrewHistoryItem) {
    // The edit dialog works on a batch's packaging runs, so make sure they are loaded
    let detail = details[item.id]
    if (!detail || detail === 'loading' || detail === 'error') {
      try {
        detail = await loadBrewDetail(item.id)
        setDetails((d) => ({ ...d, [item.id]: detail as Detail }))
      } catch {
        toast.error('Could not open that batch. Check the connection and try again.')
        return
      }
    }
    setEditItem({ ...item, ...(detail as Detail) })
  }

  function remove(item: BrewHistoryItem) {
    if (!confirm(`Permanently delete "${item.beer_name}"${item.batch_code ? ` (${item.batch_code})` : ''}? This cannot be undone.`)) return
    startTransition(async () => {
      try { await deleteBrewHistory(item.id) }
      catch { toast.error(`Could not delete ${item.beer_name}. Nothing was removed.`) }
    })
    if (openBrew === item.id) setOpenBrew(null)
  }

  if (items.length === 0) {
    return <p className="text-center py-20 text-sm text-gray-400">No completed brews yet.</p>
  }

  const batch = (item: BrewHistoryItem, why = '') => {
    const isOpen = openBrew === item.id
    const detail = details[item.id]
    const leftAt = item.packed_at ?? item.completed_at
    const summary = packedSummary(item.packed)
    // Fermenter time runs to the transfer if there was one, otherwise to the day it left
    const fvDays = differenceInDays(parseISO(item.transferred_at ?? leftAt), parseISO(item.brew_day))
    const briteDays = item.transferred_at ? Math.max(0, differenceInDays(parseISO(leftAt), parseISO(item.transferred_at))) : null
    const stats: [string, string][] = [
      ['Brew day', day(item.brew_day)],
      ['Time in FV', daysLabel(fvDays)],
      ['Time in brite', daysLabel(briteDays)],
      ['OG', item.og_plato != null ? `${item.og_plato}°P` : '-'],
      ['FG', item.final_plato != null ? `${item.final_plato}°P` : '-'],
      ['Final ABV', item.abv != null ? `${item.abv.toFixed(1)}%` : '-'],
      ['DO in brite', doRange(item.report?.bbt_do_ppb, item.report?.bbt_do_ppb_high)],
      ['DO in pack', doRange(item.report?.pack_do_ppb, item.report?.pack_do_ppb_high)],
    ]
    return (
      <li key={item.id} className={`${CARD} overflow-hidden`}>
        <button type="button" onClick={() => toggleBrew(item.id)} aria-expanded={isOpen} className="w-full text-left px-4 py-3.5 active:bg-gray-50">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 tabular-nums">
                {day(leftAt)}{item.batch_code ? <span className="text-gray-400"> · {item.batch_code}</span> : ''}
              </p>
              <p className="mt-0.5 text-[17px] font-semibold leading-snug text-gray-900 break-words">{item.beer_name}</p>
              {item.style && <p className="text-[13px] text-gray-500">{item.style}</p>}
              <p className={`mt-1.5 text-sm tabular-nums ${summary ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                {summary ?? (item.stage === 'packaged' ? 'No packaging runs logged' : 'Emptied, not packaged')}
              </p>
              {why && <p className="mt-1.5 text-xs"><span className="rounded-md bg-yeast/40 px-1.5 py-0.5 font-medium text-charcoal">{why}</span></p>}
            </div>
            <ChevronDown className={`mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-4">
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2.5">
              {stats.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] text-gray-400">{label}</dt>
                  <dd className="text-[15px] font-semibold tabular-nums text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>

            <PackReportPanel brewId={item.id} report={item.report} />

            {(item.hops.length > 0 || item.yeast.length > 0) && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {item.hops.length > 0 && <><span className="text-gray-400">Hops </span>{item.hops.join(', ')}</>}
                {item.hops.length > 0 && item.yeast.length > 0 && <span className="text-gray-300"> · </span>}
                {item.yeast.length > 0 && <><span className="text-gray-400">Yeast </span>{item.yeast.join(', ')}</>}
              </p>
            )}

            {item.final_ph != null && <p className="text-sm text-gray-600">Final pH <span className="font-semibold tabular-nums text-gray-900">{item.final_ph}</span></p>}
            {item.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{item.notes}</p>}

            {detail === 'loading' || !detail ? (
              <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" />Loading readings…</p>
            ) : detail === 'error' ? (
              <p className="text-sm text-red-600">
                Readings could not be loaded.{' '}
                <button type="button" onClick={() => loadDetail(item.id)} className="underline font-medium">Try again</button>
              </p>
            ) : (
              <>
                <section>
                  <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Packed</h3>
                  {detail.packaging_runs.length === 0 ? (
                    <p className="text-sm text-gray-400">No packaging runs logged.</p>
                  ) : (
                    <ul className="rounded-xl bg-white ring-1 ring-black/5 divide-y divide-gray-100 text-sm">
                      {detail.packaging_runs.map((p) => (
                        <li key={p.id} className="flex items-baseline gap-3 px-3 py-2">
                          <span className="flex-1 min-w-0 text-gray-900">
                            <span className="font-semibold tabular-nums">{p.qty}</span> × {PACKAGE_FORMATS.find((f) => f.format === p.format)?.label ?? p.format}
                            <span className="block text-xs text-gray-400">{day(p.packaged_at)} · {formatUserName(p.packaged_by)}{p.notes ? ` · ${p.notes}` : ''}</span>
                          </span>
                          <span className="flex-shrink-0 tabular-nums text-gray-700">{Number(p.volume_l).toFixed(1)} L</span>
                        </li>
                      ))}
                      <li className="flex items-baseline gap-3 px-3 py-2 font-semibold text-gray-900">
                        <span className="flex-1">Total packed</span>
                        <span className="tabular-nums">{detail.packaging_runs.reduce((s, p) => s + Number(p.volume_l), 0).toFixed(1)} L</span>
                      </li>
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Readings and VDK</h3>
                  {detail.readings.length === 0 && detail.vdk.length === 0 ? (
                    <p className="text-sm text-gray-400">No readings logged.</p>
                  ) : (
                    <ul className="rounded-xl bg-white ring-1 ring-black/5 divide-y divide-gray-100 text-sm">
                      {withVdk(detail.readings, detail.vdk).reverse().map((r) => {
                        const noteOnly = r.plato == null && r.ph == null
                        return (
                          <li key={r.id} className="flex items-baseline gap-3 px-3 py-2">
                            <span className="w-[4.75rem] flex-shrink-0 text-xs text-gray-400 tabular-nums">{logDayTime(r.recorded_at)}</span>
                            {r.vdk ? (
                              <span className="flex-1 min-w-0">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${VDK_STYLE[r.vdk].bg} ${VDK_STYLE[r.vdk].text} ${VDK_STYLE[r.vdk].border}`}>VDK {VDK_STYLE[r.vdk].label}</span>
                                {r.notes && <span className="block text-xs text-gray-500 mt-0.5 break-words">{r.notes}</span>}
                              </span>
                            ) : noteOnly ? (
                              <span className="flex-1 text-gray-600 break-words min-w-0">{r.notes}</span>
                            ) : (
                              <span className="flex-1 min-w-0">
                                <span className="font-semibold tabular-nums text-gray-900">
                                  {[r.plato != null ? `${r.plato}°P` : '', r.ph != null ? `pH ${r.ph}` : ''].filter(Boolean).join(' · ')}
                                </span>
                                {r.temperature_c != null && <span className="tabular-nums text-gray-400"> · {Number(r.temperature_c).toFixed(1)}°C</span>}
                                {r.notes && <span className="block text-xs text-gray-500 break-words">{r.notes}</span>}
                              </span>
                            )}
                            <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{formatUserName(r.recorded_by)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Link href={`/brews/${item.id}/sheet`} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                <ClipboardList className="h-4 w-4" />Brew sheet
              </Link>
              <button type="button" onClick={() => void edit(item)} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white ring-1 ring-black/10 text-sm font-medium text-gray-700">
                <Pencil className="h-4 w-4" />Edit batch
              </button>
              <button type="button" onClick={() => remove(item)} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl bg-white ring-1 ring-black/10 text-sm font-medium text-red-600 ml-auto">
                <Trash2 className="h-4 w-4" />Delete
              </button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Beer, batch, style, tank, hop or yeast"
          aria-label="Search every batch"
          className="w-full h-12 pl-10 pr-10 rounded-2xl bg-white ring-1 ring-black/5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-gray-400">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results ? (
        <>
          <p className="text-sm text-gray-500 mb-2 px-1">
            {results.length === 0 ? `Nothing matches “${search.trim()}” in any month.` : `${results.length} batch${results.length === 1 ? '' : 'es'} across every month`}
          </p>
          <ul className="space-y-2.5">{results.map((r) => batch(r.item, r.why))}</ul>
        </>
      ) : (
        <div className="space-y-2.5">
          {months.map(([key, list], idx) => {
            const open = openMonths.has(key)
            const year = key.slice(0, 4)
            const newYear = idx === 0 ? months.length > 0 && months[months.length - 1][0].slice(0, 4) !== year : months[idx - 1][0].slice(0, 4) !== year
            const packed = list.reduce((s, i) => s + i.packed_l, 0)
            const made = packedSummary(list.reduce((t, i) => ({ keg20: t.keg20 + i.packed.keg20, keg30: t.keg30 + i.packed.keg30, keg50: t.keg50 + i.packed.keg50, c24: t.c24 + i.packed.c24, c16: t.c16 + i.packed.c16 }), { keg20: 0, keg30: 0, keg50: 0, c24: 0, c16: 0 }))
            return (
              <section key={key}>
                {newYear && <p className={`px-1 text-sm font-semibold text-gray-500 ${idx === 0 ? 'mb-2' : 'mt-4 mb-2'}`}>{year}</p>}
                <button type="button" onClick={() => toggleMonth(key)} aria-expanded={open}
                  className={`w-full flex items-center gap-3 rounded-2xl ${yearBg(key)} px-4 py-3.5 text-left text-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] active:opacity-90`}>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-white">{monthLabel(key)}</h2>
                    <p className="text-[13px] text-white/85">
                      {list.length} batch{list.length === 1 ? '' : 'es'}{packed > 0 ? ` · ${litres(packed)}` : ''}{made ? ` · ${made}` : ''}
                    </p>
                    {!open && <p className="text-[13px] text-white/65 truncate">{[...new Set(list.map((i) => i.beer_name))].slice(0, 3).join(', ')}{new Set(list.map((i) => i.beer_name)).size > 3 ? '…' : ''}</p>}
                  </div>
                  <ChevronDown className={`h-5 w-5 flex-shrink-0 text-white/80 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && <ul className="mt-2.5 space-y-2.5 md:pl-3">{list.map((item) => batch(item))}</ul>}
              </section>
            )
          })}
        </div>
      )}

      {editItem && <EditBrewModal item={editItem} onClose={() => setEditItem(null)} />}
    </>
  )
}
