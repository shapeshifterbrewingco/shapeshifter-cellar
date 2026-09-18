'use client'

import { useState, useEffect, useTransition } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import { formatMoney, GAP_LABELS, isAmbiguousUnit, likelyUnit } from '@/lib/costing'
import type { CostLine } from '@/lib/costing'
import type { MatchCandidate } from '@/lib/matching'
import { getCandidatesForLine, searchPricedLibrary, linkIngredient } from './match-actions'
import {
  addIngredientPrice, updateRecipeLine, getPricesForIngredient, choosePriceRow, setMaterialPrice,
} from './actions'

const UNITS = ['kg', 'g', 'L', 'mL', 'each', 'pkg']

interface PriceRow {
  id: string; supplier: string; producer: string | null
  pricePerUnit: number | null; unit: string; isPreferred: boolean
}

/**
 * Inline repair for one costing line.
 *
 * Every amber row on the costing screen has a different cause, so the panel
 * offers the fix that matches: pick a product, set a price, or correct the
 * recipe quantity. All three are here because one line often has more than
 * one problem, and sending someone to another page to fix each one is how a
 * half-costed recipe stays half-costed.
 */
export function FixLine({ line, onFixed }: { line: CostLine; onFixed: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()

  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [prices, setPrices] = useState<PriceRow[] | null>(null)

  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState(line.unit && UNITS.includes(line.unit) ? line.unit : 'kg')
  const [supplier, setSupplier] = useState('')

  const [qty, setQty] = useState(line.quantity != null ? String(line.quantity) : '')
  // An ambiguous unit like "g/kg" is not a real option, so start on the one
  // the amount most likely means rather than showing an invalid selection.
  const [qtyUnit, setQtyUnit] = useState(
    isAmbiguousUnit(line.unit)
      ? (likelyUnit(line.unit, line.quantity) ?? 'g')
      : (line.unit && UNITS.includes(line.unit) ? line.unit : 'kg'),
  )

  const needsProduct = line.gap === 'not-linked' || line.gap === 'no-price'
  const needsQty = line.gap === 'no-quantity' || line.gap === 'unit-mismatch'

  useEffect(() => {
    if (!open) return
    if (needsProduct && line.recipeIngredientId && candidates == null) {
      getCandidatesForLine(line.recipeIngredientId).then(setCandidates)
    }
    if (line.ingredientId && prices == null) {
      getPricesForIngredient(line.ingredientId).then(setPrices)
    }
  }, [open, needsProduct, line.recipeIngredientId, line.ingredientId, candidates, prices])

  function runSearch(q: string) {
    setQuery(q)
    if (q.trim().length < 2) return
    setSearching(true)
    searchPricedLibrary(q).then((r) => { setCandidates(r); setSearching(false) })
  }

  function done() {
    setOpen(false)
    setCandidates(null)
    setPrices(null)
    onFixed()
  }

  if (!line.gap) return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-amber-700 underline decoration-amber-300 hover:decoration-amber-600"
      >
        {GAP_LABELS[line.gap]} · fix
      </button>
    )
  }

  return (
    <div className="mt-2 border border-amber-200 bg-amber-50/60 rounded-lg p-3 space-y-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800">
          {line.name}
          <span className="font-normal text-amber-700 ml-1.5">{GAP_LABELS[line.gap]}</span>
        </p>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Existing prices on this ingredient ─────────────── */}
      {prices && prices.length > 1 && (
        <div>
          <p className="text-[11px] font-medium text-gray-600 mb-1">
            This ingredient has {prices.length} prices. Pick the one you buy.
          </p>
          <div className="space-y-1">
            {prices.map((p) => (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => startTransition(async () => {
                  await choosePriceRow(line.ingredientId!, p.id)
                  done()
                })}
                className={`w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded border text-xs bg-white hover:border-primary/40 ${
                  p.isPreferred ? 'border-primary/50' : 'border-gray-200'
                }`}
              >
                <span className="text-gray-700 truncate">
                  {p.supplier}{p.producer ? ` · ${p.producer}` : ''}
                  {p.isPreferred && <span className="text-primary ml-1.5">in use</span>}
                </span>
                <span className="tabular-nums text-gray-800 whitespace-nowrap">
                  {p.pricePerUnit != null ? `${formatMoney(p.pricePerUnit)}/${p.unit}` : '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Link to a priced product ───────────────────────── */}
      {needsProduct && line.recipeIngredientId && (
        <div>
          <p className="text-[11px] font-medium text-gray-600 mb-1">Point it at a priced product</p>

          <div className="relative mb-1.5">
            <Search className="h-3 w-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search the price library"
              className="w-full border border-gray-200 rounded pl-7 pr-2 py-1.5 text-xs bg-white"
            />
          </div>

          {searching && <p className="text-[11px] text-gray-400">Searching…</p>}

          {candidates == null && !searching && (
            <p className="text-[11px] text-gray-400">Loading suggestions…</p>
          )}

          {candidates?.length === 0 && (
            <p className="text-[11px] text-gray-500">
              Nothing priced matches. Set a price below instead.
            </p>
          )}

          <div className="space-y-1 max-h-44 overflow-y-auto">
            {candidates?.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={() => startTransition(async () => {
                  await linkIngredient(line.recipeIngredientId!, c.id)
                  done()
                })}
                className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded border border-gray-200 bg-white hover:border-primary/40 text-xs disabled:opacity-50"
              >
                <span className="text-gray-700 truncate">{c.name}</span>
                <span className="tabular-nums text-gray-800 whitespace-nowrap">
                  {c.pricePerUnit != null ? `${formatMoney(c.pricePerUnit)}/${c.unit}` : '—'}
                  <span className="text-gray-400 ml-1.5">{c.supplier}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Set a price directly ───────────────────────────── */}
      {line.ingredientId && (
        <div>
          <p className="text-[11px] font-medium text-gray-600 mb-1">
            Or set the price you pay for {line.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">$</span>
            <input
              type="number" step="0.0001" min="0" value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs tabular-nums bg-white"
            />
            <span className="text-xs text-gray-400">per</span>
            <select
              value={unit} onChange={(e) => setUnit(e.target.value)}
              className="border border-gray-200 rounded px-1.5 py-1.5 text-xs bg-white"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <input
              value={supplier} onChange={(e) => setSupplier(e.target.value)}
              placeholder="supplier"
              className="w-28 border border-gray-200 rounded px-2 py-1.5 text-xs bg-white"
            />
            <button
              disabled={busy || !price}
              onClick={() => startTransition(async () => {
                await addIngredientPrice({
                  ingredientId: line.ingredientId!,
                  price: parseFloat(price),
                  unit,
                  supplier: supplier || 'Manual entry',
                })
                done()
              })}
              className="inline-flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-2.5 py-1.5 rounded hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Fix the recipe quantity or unit ────────────────── */}
      {(needsQty || line.quantity == null) && line.recipeIngredientId && (
        <div>
          <p className="text-[11px] font-medium text-gray-600 mb-1">
            {line.gap === 'unit-mismatch'
              ? isAmbiguousUnit(line.unit)
                ? `The recipe says ${line.unit}, which is a column heading meaning one unit or the other. Pick which.`
                : `The recipe says ${line.unit ?? '?'}, which cannot be costed against a price per ${line.priceUnit ?? '?'}. Correct it.`
              : 'Set the quantity the recipe uses'}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="number" step="0.01" min="0" value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="qty"
              className="w-20 border border-gray-200 rounded px-2 py-1.5 text-xs tabular-nums bg-white"
            />
            <select
              value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)}
              className="border border-gray-200 rounded px-1.5 py-1.5 text-xs bg-white"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button
              disabled={busy || !qty}
              onClick={() => startTransition(async () => {
                await updateRecipeLine({
                  recipeIngredientId: line.recipeIngredientId!,
                  quantity: parseFloat(qty),
                  unit: qtyUnit,
                })
                done()
              })}
              className="inline-flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-2.5 py-1.5 rounded hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Save to recipe
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Inline price entry for one unpriced packaging material, shown against the
 * format that consumes it. Saves straight into the price book.
 */
export function FixMaterial({ materialId, name, detail, onFixed }: {
  materialId: string; name: string; detail: string; onFixed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState('')
  const [supplier, setSupplier] = useState('')
  const [busy, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 hover:bg-amber-100"
      >
        {name} · add price
      </button>
    )
  }

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-2.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold text-gray-800">{name}</span>
      <span className="text-[11px] text-gray-400">{detail}</span>
      <span className="text-xs text-gray-400">$</span>
      <input
        type="number" step="0.0001" min="0" value={price} autoFocus
        onChange={(e) => setPrice(e.target.value)}
        placeholder="each"
        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs tabular-nums bg-white"
      />
      <input
        value={supplier} onChange={(e) => setSupplier(e.target.value)}
        placeholder="supplier"
        className="w-24 border border-gray-200 rounded px-2 py-1 text-xs bg-white"
      />
      <button
        disabled={busy || !price}
        onClick={() => startTransition(async () => {
          await setMaterialPrice(materialId, parseFloat(price), supplier)
          setOpen(false)
          onFixed()
        })}
        className="inline-flex items-center gap-1 text-xs font-medium bg-primary text-primary-foreground px-2 py-1 rounded hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Save
      </button>
      <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
