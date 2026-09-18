'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Check, Link as LinkIcon, FileText } from 'lucide-react'
import { FORMAT_ORDER, FORMAT_META, formatMoney } from '@/lib/costing'
import { MATERIAL_CATEGORY_LABELS } from '@/lib/packaging-materials'
import type { MaterialCategory } from '@/lib/packaging-materials'
import { importPackagingCosts } from './actions'
import type { ParsedMaterial } from './actions'

type Row = ParsedMaterial & { selected: boolean }

export function PackagingImport() {
  const router = useRouter()
  const [mode, setMode] = useState<'file' | 'sheet'>('sheet')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  async function parse(e: React.FormEvent) {
    e.preventDefault()
    setParsing(true); setError(null); setRows(null); setDone(null)
    try {
      const fd = new FormData()
      if (mode === 'sheet') {
        if (!url.trim()) throw new Error('Paste a Google Sheets link first')
        fd.append('url', url.trim())
      } else {
        if (!file) throw new Error('Choose a file first')
        fd.append('file', file)
      }
      const res = await fetch('/api/parse-packaging-costs', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Parse failed')

      const items = (json.items as ParsedMaterial[]).map((i) => ({
        ...i,
        selected: i.price != null,
        category: (i.category ?? 'other') as MaterialCategory,
      }))
      if (items.length === 0) throw new Error('No packaging cost lines found in that document')
      setRows(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setParsing(false)
    }
  }

  function apply() {
    if (!rows) return
    startTransition(async () => {
      const chosen = rows.filter((r) => r.selected)
      const res = await importPackagingCosts(chosen)
      setDone(`${res.created} added, ${res.updated} updated.`)
      setRows(null)
      router.refresh()
    })
  }

  const chosenCount = rows?.filter((r) => r.selected).length ?? 0

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Import packaging costs
      </h2>
      <p className="text-xs text-gray-400 mt-1 mb-3">
        Pull cost lines straight out of a costing sheet, supplier quote or invoice. Ingredients are
        ignored, and so is excise. Nothing is written until you confirm.
      </p>

      <div className="flex gap-1 mb-3">
        {([['sheet', 'Google Sheet', LinkIcon], ['file', 'PDF or file', FileText]] as const).map(
          ([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null) }}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                mode === m
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ),
        )}
      </div>

      <form onSubmit={parse} className="flex flex-wrap items-end gap-2">
        {mode === 'sheet' ? (
          <div className="flex-1 min-w-[240px]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-[240px]">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.csv,.txt,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:bg-white file:text-xs file:font-medium"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={parsing}
          className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {parsing ? 'Reading…' : 'Read costs'}
        </button>
      </form>

      {mode === 'sheet' && (
        <p className="text-[11px] text-gray-400 mt-2">
          The sheet has to be readable without signing in. Either set link sharing to anyone with the
          link, or use File &gt; Share &gt; Publish to web on the costs tab. Put the tab&apos;s{' '}
          <code className="text-gray-500">gid</code> in the link to pick it.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          {error}
        </p>
      )}

      {done && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-3 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" />
          {done}
        </p>
      )}

      {rows && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">
              Found {rows.length}. {chosenCount} selected.
            </p>
            <button
              onClick={apply}
              disabled={saving || chosenCount === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Apply {chosenCount}
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[620px]">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100 bg-gray-50/60">
                  <th className="w-8 py-1.5" />
                  <th className="text-left font-medium py-1.5 px-2">Cost line</th>
                  <th className="text-left font-medium py-1.5 w-28">Type</th>
                  <th className="text-right font-medium py-1.5 w-20">Price</th>
                  {FORMAT_ORDER.map((f) => (
                    <th key={f} className="text-right font-medium py-1.5 w-14 px-1">
                      {FORMAT_META[f].isKeg ? FORMAT_META[f].label.replace('Keg ', '') : f.split('x')[0] + 'pk'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={(e) => setRows(rows.map((x, j) =>
                          j === i ? { ...x, selected: e.target.checked } : x))}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="text-gray-800">{r.name}</span>
                      {r.notes && <span className="block text-[11px] text-gray-400">{r.notes}</span>}
                    </td>
                    <td className="py-1.5 text-xs text-gray-500">
                      {MATERIAL_CATEGORY_LABELS[r.category] ?? r.category}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {r.price != null
                        ? <span className="text-gray-800">{formatMoney(r.price, r.price < 1 ? 4 : 2)}</span>
                        : <span className="text-amber-600 text-xs">no price</span>}
                    </td>
                    {([r.qty_24x375, r.qty_16x440, r.qty_keg30, r.qty_keg50] as (number | null)[])
                      .map((q, k) => (
                        <td key={k} className="py-1.5 text-right tabular-nums text-xs text-gray-500 px-1">
                          {q ?? ''}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
