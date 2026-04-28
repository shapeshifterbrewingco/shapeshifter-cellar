'use client'

import { useState, useEffect, useTransition, useMemo } from 'react'
import { Star, Search, Pencil, Trash2, Check, X, AlertCircle } from 'lucide-react'
import { toggleFavourite, deleteIngredient, deleteIngredients, updateIngredient } from './actions'
import type { EditPrice } from './actions'
import type { IngredientCategory } from '@/types'
import type { IngredientWithPrices } from '@/lib/ingredients'

const CATEGORIES: IngredientCategory[] = ['malt', 'hop', 'yeast', 'adjunct', 'finings', 'water_treatment', 'other']

const CAT_LABELS: Record<IngredientCategory, string> = {
  malt: 'Malt', hop: 'Hop', yeast: 'Yeast', adjunct: 'Adjunct',
  finings: 'Finings', water_treatment: 'Water Treatment', other: 'Other',
}

type FilterTab = 'all' | 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',     label: 'All' },
  { id: 'malt',    label: 'Malt' },
  { id: 'hop',     label: 'Hops' },
  { id: 'yeast',   label: 'Yeast' },
  { id: 'adjunct', label: 'Adjunct' },
  { id: 'other',   label: 'Other' },
]

const OTHER_CATS: IngredientCategory[] = ['finings', 'water_treatment', 'other']

const CAT_COLOURS: Record<IngredientCategory, string> = {
  malt: 'bg-amber-50 text-amber-700',
  hop: 'bg-[#09434d]/10 text-[#09434d]',
  yeast: 'bg-purple-50 text-purple-700',
  adjunct: 'bg-blue-50 text-blue-700',
  finings: 'bg-gray-100 text-gray-600',
  water_treatment: 'bg-cyan-50 text-cyan-700',
  other: 'bg-gray-100 text-gray-500',
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

interface EditPriceInput {
  id: string
  supplier: string
  producer: string
  priceInput: string
  unit: string
}

interface EditState {
  name: string
  category: IngredientCategory
  unit: string
  prices: EditPriceInput[]
}

function toEditState(ing: IngredientWithPrices): EditState {
  const prices = ing.ingredient_prices.map((p) => ({
    id: p.id,
    supplier: p.supplier,
    producer: p.producer,
    priceInput: p.price_per_unit != null ? String(p.price_per_unit) : '',
    unit: p.unit,
  }))
  if (prices.length === 0) {
    prices.push({ id: '', supplier: '', producer: '', priceInput: '', unit: ing.default_unit })
  }
  return { name: ing.name, category: ing.category, unit: ing.default_unit, prices }
}

export function IngredientLibrary({ ingredients: initial }: { ingredients: IngredientWithPrices[] }) {
  const [ingredients, setIngredients] = useState(initial)
  useEffect(() => { setIngredients(initial) }, [initial])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<FilterTab>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    let result = ingredients

    if (categoryFilter !== 'all') {
      const cats = categoryFilter === 'other'
        ? OTHER_CATS
        : [categoryFilter as IngredientCategory]
      result = result.filter(ing => cats.includes(ing.category))
    }

    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (ing) =>
          ing.name.toLowerCase().includes(q) ||
          CAT_LABELS[ing.category].toLowerCase().includes(q) ||
          ing.ingredient_prices.some((p) => p.supplier.toLowerCase().includes(q) || p.producer.toLowerCase().includes(q))
      )
    }

    return result
  }, [ingredients, search, categoryFilter])

  // ── Selection ──────────────────────────────────────────────
  const filteredIds = filtered.map((i) => i.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))
  const someSelected = filteredIds.some((id) => selected.has(id))

  function toggleAll() {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filteredIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelected((prev) => new Set([...prev, ...filteredIds]))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Bulk delete ────────────────────────────────────────────
  function handleBulkDelete() {
    const ids = [...selected].filter((id) => filteredIds.includes(id))
    if (!confirm(`Delete ${ids.length} ingredient${ids.length !== 1 ? 's' : ''} and all their prices?`)) return
    setIngredients((prev) => prev.filter((i) => !ids.includes(i.id)))
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
    startTransition(() => deleteIngredients(ids))
  }

  // ── Single delete ──────────────────────────────────────────
  function handleDeleteClick(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its prices? This cannot be undone.`)) return
    setIngredients((prev) => prev.filter((i) => i.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    startTransition(() => deleteIngredient(id))
  }

  // ── Star ───────────────────────────────────────────────────
  function handleStar(id: string, current: boolean) {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, is_favourite: !current } : i)))
    startTransition(() => toggleFavourite(id, !current))
  }

  // ── Edit ───────────────────────────────────────────────────
  function startEdit(ing: IngredientWithPrices) {
    setEditingId(ing.id)
    setEditState(toEditState(ing))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  function updateEditPrice(idx: number, field: keyof EditPriceInput, value: string) {
    setEditState((s) => {
      if (!s) return s
      const prices = s.prices.map((p, i) => i === idx ? { ...p, [field]: value } : p)
      return { ...s, prices }
    })
  }

  function saveEdit(id: string) {
    if (!editState) return
    const prices: EditPrice[] = editState.prices
      .filter((p) => p.id || p.supplier.trim())
      .map((p) => ({
        id: p.id,
        supplier: p.supplier,
        producer: p.producer,
        price_per_unit: p.priceInput !== '' ? parseFloat(p.priceInput) : null,
        unit: p.unit || editState.unit,
      }))
    setIngredients((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const updatedPrices = i.ingredient_prices.length > 0
          ? i.ingredient_prices.map((p, idx) => ({
              ...p,
              supplier: prices[idx]?.supplier ?? p.supplier,
              price_per_unit: prices[idx]?.price_per_unit ?? p.price_per_unit,
            }))
          : prices
              .filter((p) => !p.id && p.supplier.trim())
              .map((p) => ({
                id: 'optimistic',
                supplier: p.supplier,
                producer: p.producer,
                supplier_code: null,
                price_per_unit: p.price_per_unit,
                unit: p.unit,
                imported_at: new Date().toISOString(),
              }))
        return { ...i, name: editState.name, category: editState.category, default_unit: editState.unit, ingredient_prices: updatedPrices }
      })
    )
    startTransition(() => updateIngredient(id, { name: editState.name, category: editState.category, unit: editState.unit, prices }))
    setEditingId(null)
    setEditState(null)
  }

  const selectedCount = [...selected].filter((id) => filteredIds.includes(id)).length

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-0 border-b border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-800 flex-shrink-0">Ingredient Library</h2>
          <span className="text-xs text-gray-400 flex-shrink-0">{filtered.length}{filtered.length !== ingredients.length ? ` of ${ingredients.length}` : ''}</span>

          {someSelected && (
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={isPending}
              className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedCount} selected
            </button>
          )}

          <div className="relative flex-1 max-w-xs ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, supplier…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex gap-0.5">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                categoryFilter === tab.id
                  ? 'bg-primary text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {ingredients.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-gray-400">No ingredients yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            They'll appear here as you create recipes or import a price list.
          </p>
        </div>
      ) : (
        <div className="overflow-auto max-h-[480px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-8 px-2 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                    onChange={toggleAll}
                    className="rounded accent-primary"
                  />
                </th>
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5 text-left font-medium text-gray-500">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-28">Category</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-500">Supplier</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-28">Price</th>
                <th className="w-16 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                    No ingredients match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              ) : (
                filtered.map((ing) => {
                  const isEditing = editingId === ing.id
                  const isSelected = selected.has(ing.id)
                  const prices = isEditing ? editState!.prices : ing.ingredient_prices

                  return (
                    <tr
                      key={ing.id}
                      className={`border-b border-gray-50 last:border-0 align-top ${
                        isEditing ? 'bg-primary/5' : isSelected ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(ing.id)}
                          className="rounded accent-primary"
                        />
                      </td>

                      {/* Star */}
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleStar(ing.id, ing.is_favourite)}
                          className="p-0.5 rounded hover:bg-amber-50"
                          title={ing.is_favourite ? 'Remove favourite' : 'Mark as favourite'}
                        >
                          <Star
                            className={`h-3.5 w-3.5 transition-colors ${
                              ing.is_favourite
                                ? 'fill-amber-400 stroke-amber-400'
                                : 'stroke-gray-300 hover:stroke-amber-300'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Name */}
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editState!.name}
                            onChange={(e) => setEditState((s) => s ? { ...s, name: e.target.value } : s)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        ) : (
                          <span className="text-gray-800 font-medium">{ing.name}</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-3 py-2.5">
                        {isEditing ? (
                          <select
                            value={editState!.category}
                            onChange={(e) =>
                              setEditState((s) => s ? { ...s, category: e.target.value as IngredientCategory } : s)
                            }
                            className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{CAT_LABELS[c]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${CAT_COLOURS[ing.category]}`}>
                            {CAT_LABELS[ing.category]}
                          </span>
                        )}
                      </td>

                      {/* Supplier + Producer */}
                      <td className="px-3 py-2.5">
                        {prices.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="space-y-2">
                            {prices.map((p, idx) =>
                              isEditing ? (
                                <div key={p.id} className="space-y-1">
                                  <input
                                    value={(p as EditPriceInput).supplier}
                                    onChange={(e) => updateEditPrice(idx, 'supplier', e.target.value)}
                                    placeholder="Supplier"
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  />
                                  <input
                                    value={(p as EditPriceInput).producer}
                                    onChange={(e) => updateEditPrice(idx, 'producer', e.target.value)}
                                    placeholder="Producer (e.g. Weyermann)"
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-primary/40"
                                  />
                                </div>
                              ) : (
                                <div key={p.id}>
                                  <div className="text-gray-700">{p.supplier}</div>
                                  {(p as IngredientWithPrices['ingredient_prices'][number]).producer && (
                                    <div className="text-gray-400 text-xs">
                                      by {(p as IngredientWithPrices['ingredient_prices'][number]).producer}
                                    </div>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </td>

                      {/* Price */}
                      <td className="px-3 py-2.5">
                        {prices.length === 0 ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <div className="space-y-1.5">
                            {prices.map((p, idx) => {
                              if (isEditing) {
                                const ep = p as EditPriceInput
                                return (
                                  <div key={p.id} className="flex items-center gap-1">
                                    <span className="text-gray-400">$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={ep.priceInput}
                                      onChange={(e) => updateEditPrice(idx, 'priceInput', e.target.value)}
                                      className="w-20 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                                      placeholder="0.00"
                                    />
                                    <span className="text-gray-400">/{ep.unit}</span>
                                  </div>
                                )
                              }
                              const rp = p as IngredientWithPrices['ingredient_prices'][number]
                              const days = daysSince(rp.imported_at)
                              const stale = days > 90
                              const veryStale = days > 180
                              return (
                                <div key={p.id} className="flex items-center gap-1.5">
                                  <span className="tabular-nums text-gray-800 font-medium">
                                    {rp.price_per_unit != null
                                      ? `$${Number(rp.price_per_unit).toFixed(2)}/${rp.unit}`
                                      : '—'}
                                  </span>
                                  {stale && (
                                    <span
                                      title={`Last imported ${days} days ago`}
                                      className={`flex items-center gap-0.5 ${veryStale ? 'text-red-400' : 'text-amber-400'}`}
                                    >
                                      <AlertCircle className="h-3 w-3" />
                                      <span>{days}d</span>
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-2.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => saveEdit(ing.id)}
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                              title="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="p-1 rounded text-gray-400 hover:bg-gray-100"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(ing)}
                              className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(ing.id, ing.name)}
                              className="p-1 rounded text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-gray-50 bg-gray-50/50">
        <p className="text-xs text-gray-400">
          Re-uploading a supplier&rsquo;s price list overwrites their existing prices and resets the import date.
          Prices older than 90 days are flagged with <AlertCircle className="h-3 w-3 inline text-amber-400 mx-0.5" />.
        </p>
      </div>
    </div>
  )
}
