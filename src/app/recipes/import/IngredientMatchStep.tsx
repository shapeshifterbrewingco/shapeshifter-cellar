'use client'

import { useState, useTransition } from 'react'
import { Check, ChevronRight, Loader2, Plus, X } from 'lucide-react'
import { IngredientAutocomplete } from '@/components/recipes/IngredientAutocomplete'
import { createIngredient } from '@/app/ingredients/actions'
import type { IngredientOption } from '@/components/recipes/IngredientAutocomplete'
import type { IngredientCategory, AdditionStage } from '@/types'

const CATEGORIES: IngredientCategory[] = ['malt', 'hop', 'yeast', 'adjunct', 'finings', 'water_treatment', 'other']
const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  malt: 'Malt', hop: 'Hop', yeast: 'Yeast', adjunct: 'Adjunct',
  finings: 'Finings', water_treatment: 'Water Treatment', other: 'Other',
}

export type MatchableIngredient = {
  key: string
  parsedName: string
  category: IngredientCategory
  addition_stage: AdditionStage
  quantity: number | null
  unit: string | null
  time_minutes: number | null
  trigger: string | null
  autoMatch: IngredientOption | null
}

export type ResolvedIngredient = {
  ingredient_id: string | null
  name: string
  category: IngredientCategory
  addition_stage: AdditionStage
  quantity: number | null
  unit: string | null
  time_minutes: number | null
  trigger: string | null
}

type RowMode = 'matched' | 'searching' | 'creating'

type MatchRow = MatchableIngredient & {
  match: IngredientOption | null
  mode: RowMode
  searchValue: string
  newName: string
  newCategory: IngredientCategory
  newUnit: string
  newSupplier: string
  newProducer: string
  newPrice: string
}

interface Props {
  items: MatchableIngredient[]
  allIngredients: IngredientOption[]
  onProceed: (resolved: ResolvedIngredient[]) => void
  onBack: () => void
}

export function IngredientMatchStep({ items, allIngredients, onProceed, onBack }: Props) {
  const [rows, setRows] = useState<MatchRow[]>(() =>
    items.map(ing => ({
      ...ing,
      match: ing.autoMatch,
      mode: ing.autoMatch ? 'matched' : 'searching',
      searchValue: '',
      newName: ing.parsedName,
      newCategory: ing.category,
      newUnit: ing.unit ?? '',
      newSupplier: '',
      newProducer: '',
      newPrice: '',
    }))
  )
  const [localIngredients, setLocalIngredients] = useState(allIngredients)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function update(key: string, patch: Partial<MatchRow>) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r))
  }

  function handleSelect(key: string, _name: string, option?: IngredientOption) {
    if (option) {
      update(key, { match: option, mode: 'matched', searchValue: '' })
    }
  }

  function handleSaveNew(key: string) {
    const row = rows.find(r => r.key === key)
    if (!row) return
    setSavingKey(key)
    startTransition(async () => {
      try {
        const price = row.newPrice ? parseFloat(row.newPrice) : null
        const ing = await createIngredient({
          name: row.newName.trim() || row.parsedName,
          category: row.newCategory,
          unit: row.newUnit || 'kg',
          supplier: row.newSupplier || undefined,
          producer: row.newProducer || undefined,
          price: isNaN(price as number) ? null : price,
        })
        const option: IngredientOption = { ...ing, is_favourite: false }
        setLocalIngredients(prev => [...prev, option])
        update(key, { match: option, mode: 'matched' })
      } finally {
        setSavingKey(null)
      }
    })
  }

  function handleProceed() {
    const resolved: ResolvedIngredient[] = rows.map(r => ({
      ingredient_id: r.match?.id ?? null,
      name: r.match?.name ?? r.parsedName,
      category: r.match?.category ?? r.category,
      addition_stage: r.addition_stage,
      quantity: r.quantity,
      unit: r.unit,
      time_minutes: r.time_minutes,
      trigger: r.trigger,
    }))
    onProceed(resolved)
  }

  const matchedCount = rows.filter(r => r.match).length
  const total = rows.length

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Match Ingredients</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {matchedCount} of {total} matched to your ingredient database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
            ← Back
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Proceed to Recipe
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.key} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-start gap-3">
              {/* Left: parsed ingredient info */}
              <div className="flex-shrink-0 min-w-0 w-48">
                <p className="text-sm font-medium text-gray-800 truncate">{row.parsedName}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {[row.quantity != null ? `${row.quantity}` : null, row.unit].filter(Boolean).join(' ')}
                  {row.quantity == null && !row.unit ? '—' : ''}
                  {' · '}
                  <span className="capitalize">{CATEGORY_LABELS[row.category]}</span>
                </p>
              </div>

              <div className="flex-shrink-0 self-center text-gray-300 text-base">→</div>

              {/* Right: match control */}
              <div className="flex-1 min-w-0">
                {row.mode === 'matched' && row.match && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 bg-[#09434d]/10 text-[#09434d] border border-[#09434d]/20 text-xs font-medium px-2.5 py-1 rounded-full">
                      <Check className="h-3 w-3" />
                      {row.match.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => update(row.key, { mode: 'searching', searchValue: '' })}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Change
                    </button>
                  </div>
                )}

                {row.mode === 'searching' && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 max-w-xs">
                      <IngredientAutocomplete
                        value={row.searchValue}
                        onChange={(val, opt) => {
                          update(row.key, { searchValue: val })
                          if (opt) handleSelect(row.key, val, opt)
                        }}
                        ingredients={localIngredients}
                        placeholder="Search ingredient DB…"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => update(row.key, { mode: 'creating' })}
                      className="inline-flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 whitespace-nowrap"
                    >
                      <Plus className="h-3 w-3" />
                      New
                    </button>
                  </div>
                )}

                {row.mode === 'creating' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[10px] text-gray-400 mb-0.5">Name</label>
                        <input
                          type="text"
                          value={row.newName}
                          onChange={e => update(row.key, { newName: e.target.value })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">Category</label>
                        <select
                          value={row.newCategory}
                          onChange={e => update(row.key, { newCategory: e.target.value as IngredientCategory })}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 bg-white"
                        >
                          {CATEGORIES.map(c => (
                            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">Unit</label>
                        <input
                          type="text"
                          value={row.newUnit}
                          onChange={e => update(row.key, { newUnit: e.target.value })}
                          placeholder="kg"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">Supplier</label>
                        <input
                          type="text"
                          value={row.newSupplier}
                          onChange={e => update(row.key, { newSupplier: e.target.value })}
                          placeholder="Optional"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">Producer</label>
                        <input
                          type="text"
                          value={row.newProducer}
                          onChange={e => update(row.key, { newProducer: e.target.value })}
                          placeholder="Optional"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-0.5">Price / unit</label>
                        <input
                          type="number"
                          value={row.newPrice}
                          onChange={e => update(row.key, { newPrice: e.target.value })}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveNew(row.key)}
                        disabled={savingKey === row.key}
                        className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        {savingKey === row.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Save & Match
                      </button>
                      <button
                        type="button"
                        onClick={() => update(row.key, { mode: 'searching' })}
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-5">
        <button type="button" onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back
        </button>
        <button
          type="button"
          onClick={handleProceed}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Proceed to Recipe
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
