'use client'

import { useState, useRef, useTransition } from 'react'
import { Upload, Loader2, FileText, Check, ChevronDown } from 'lucide-react'
import { importPriceList, type ImportItem } from './actions'
import type { IngredientCategory } from '@/types'

const CATEGORIES: IngredientCategory[] = [
  'malt', 'hop', 'yeast', 'adjunct', 'finings', 'water_treatment', 'other',
]

const CAT_LABELS: Record<IngredientCategory, string> = {
  malt: 'Malt', hop: 'Hop', yeast: 'Yeast', adjunct: 'Adjunct',
  finings: 'Finings', water_treatment: 'Water Treatment', other: 'Other',
}

interface ParsedItem {
  selected: boolean
  name: string
  producer: string
  category: IngredientCategory
  unit: string
  price: number | null
  supplier_code: string | null
}

function guessCategory(raw: string): IngredientCategory {
  const c = raw?.toLowerCase()
  if (CATEGORIES.includes(c as IngredientCategory)) return c as IngredientCategory
  return 'other'
}

export function PriceListImport() {
  const [supplier, setSupplier] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [rawDebug, setRawDebug] = useState<string | null>(null)
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [importedCount, setImportedCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setParsing(true)
    setParseError(null)
    setRawDebug(null)
    setItems(null)
    setImportedCount(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('supplier', supplier || 'Unknown Supplier')
      const res = await fetch('/api/parse-price-list', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) {
        if (json.raw) setRawDebug(json.raw)
        throw new Error(json.error ?? 'Parse failed')
      }

      setItems(
        (json.items as {
          name: string
          producer: string | null
          category: string
          unit: string
          price: number | null
          supplier_code: string | null
        }[]).map((item) => ({
          selected: true,
          name: item.name ?? '',
          producer: item.producer ?? '',
          category: guessCategory(item.category),
          unit: item.unit ?? 'kg',
          price: item.price ?? null,
          supplier_code: item.supplier_code ?? null,
        }))
      )
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setParsing(false)
    }
  }

  function toggleAll(selected: boolean) {
    setItems((prev) => prev?.map((i) => ({ ...i, selected })) ?? null)
  }

  function toggleItem(idx: number) {
    setItems((prev) => prev?.map((item, i) => i === idx ? { ...item, selected: !item.selected } : item) ?? null)
  }

  function updateItem(idx: number, field: keyof ParsedItem, value: string | boolean | number | null) {
    setItems((prev) => prev?.map((item, i) => i === idx ? { ...item, [field]: value } : item) ?? null)
  }

  function handleImport() {
    if (!items) return
    const payload: ImportItem[] = items.map((i) => ({
      ...i,
      supplier: supplier.trim() || 'Unknown Supplier',
    }))
    startTransition(async () => {
      const { imported } = await importPriceList(payload)
      setImportedCount(imported)
      setItems(null)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  const selectedCount = items?.filter((i) => i.selected).length ?? 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800">Import Supplier Price List</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a PDF, image, or CSV — AI extracts ingredients with producer and pricing.
          </p>

          {importedCount !== null && (
            <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5" />
              {importedCount} ingredient{importedCount !== 1 ? 's' : ''} imported successfully.
            </div>
          )}

          {!items ? (
            <form onSubmit={handleParse} className="mt-4 space-y-3">
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Supplier name (e.g. Bintani, Cryer Malt)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />

              <div
                className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 hover:bg-gray-50 transition-colors"
                onClick={() => inputRef.current?.click()}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.tsv"
                  className="hidden"
                  onChange={(e) => { setFile(e.target.files?.[0] ?? null); setImportedCount(null) }}
                />
                {file ? (
                  <p className="text-sm text-gray-700 font-medium">{file.name}</p>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-500">PDF, image, or CSV/text</p>
                  </>
                )}
              </div>

              {parseError && (
                <div className="space-y-1">
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{parseError}</p>
                  {rawDebug && (
                    <details className="text-xs">
                      <summary className="text-gray-400 cursor-pointer hover:text-gray-600">Show raw AI response (debug)</summary>
                      <pre className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded overflow-auto text-gray-600 whitespace-pre-wrap break-all max-h-40">{rawDebug}</pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={parsing || !file || !supplier.trim()}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {parsing ? 'Parsing…' : 'Parse Price List'}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800">
                  Found {items.length} items — review and import
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <button type="button" onClick={() => toggleAll(true)} className="text-primary hover:underline">All</button>
                  <button type="button" onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">None</button>
                  <button type="button" onClick={() => { setItems(null); setFile(null) }} className="text-gray-400 hover:underline">← Back</button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-8 px-2 py-2" />
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Producer</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 w-28">Category</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Price</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 w-14">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx} className={`border-b border-gray-50 last:border-0 ${!item.selected ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleItem(idx)}
                            className="rounded accent-primary"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            className="w-full text-xs text-gray-800 bg-transparent focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={item.producer}
                            onChange={(e) => updateItem(idx, 'producer', e.target.value)}
                            placeholder="e.g. Weyermann"
                            className="w-full text-xs text-gray-600 bg-transparent focus:outline-none focus:bg-white focus:border focus:border-gray-200 focus:rounded px-1 placeholder:text-gray-300"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="relative">
                            <select
                              value={item.category}
                              onChange={(e) => updateItem(idx, 'category', e.target.value)}
                              className="w-full text-xs text-gray-600 bg-transparent appearance-none pr-4 focus:outline-none"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>{CAT_LABELS[c]}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-0 top-0.5 h-3 w-3 text-gray-400 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                          {item.price != null ? `$${item.price.toFixed(2)}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{selectedCount} of {items.length} selected</p>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isPending || selectedCount === 0}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import {selectedCount} ingredient{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
