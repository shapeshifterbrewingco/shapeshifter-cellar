'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Plus, Loader2 } from 'lucide-react'
import { createRecipe, updateRecipe, type RecipeFormData } from '@/app/recipes/actions'
import type { Recipe, RecipeIngredient, AdditionStage, IngredientCategory, RecipeTag } from '@/types'
import { ADDITION_STAGE_LABELS, ADDITION_STAGE_ORDER, RECIPE_TAGS, RECIPE_TAG_LABELS, RECIPE_TAG_COLOURS } from '@/types'
import { StylePicker } from './StylePicker'
import { IngredientAutocomplete, type IngredientOption } from './IngredientAutocomplete'

const CUSTOM_STYLE_VALUE = '__custom__'

type DraftIngredient = {
  _key: string
  ingredient_id: string | null
  name: string
  category: IngredientCategory
  addition_stage: AdditionStage
  quantity: string
  unit: string
  time_minutes: string
  trigger: string
  sort_order: number
}

function blankIngredient(stage: AdditionStage, index: number): DraftIngredient {
  const categoryMap: Record<AdditionStage, IngredientCategory> = {
    malt: 'malt', mash_addition: 'adjunct', mash_hop: 'hop',
    kettle_addition: 'adjunct', kettle_hop: 'hop', dry_hop: 'hop',
    yeast: 'yeast', process: 'other',
  }
  return {
    _key: `${Date.now()}-${index}`, ingredient_id: null, name: '',
    category: categoryMap[stage], addition_stage: stage,
    quantity: '', unit: defaultUnit(stage), time_minutes: '', trigger: '',
    sort_order: index,
  }
}

function defaultUnit(stage: AdditionStage): string {
  if (['malt', 'mash_addition', 'kettle_addition'].includes(stage)) return 'kg'
  if (['mash_hop', 'kettle_hop', 'dry_hop'].includes(stage)) return 'g'
  if (stage === 'yeast') return 'pkg'
  return ''
}

function ingredientsToDraft(ingredients: RecipeIngredient[]): DraftIngredient[] {
  return ingredients.map((ing, i) => ({
    _key: ing.id, ingredient_id: ing.ingredient_id, name: ing.name,
    category: ing.category, addition_stage: ing.addition_stage,
    quantity: ing.quantity?.toString() ?? '', unit: ing.unit ?? '',
    time_minutes: ing.time_minutes?.toString() ?? '', trigger: ing.trigger ?? '',
    sort_order: i,
  }))
}

interface RecipeFormProps {
  recipe?: Recipe
  styles: { name: string; hex_colour: string }[]
  ingredients: IngredientOption[]
}

export function RecipeForm({ recipe, styles, ingredients }: RecipeFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const existingStyleName = recipe?.style ?? ''
  const isExistingCustom = existingStyleName && !styles.find((s) => s.name === existingStyleName)

  const [styleSelect, setStyleSelect] = useState<string>(
    isExistingCustom ? CUSTOM_STYLE_VALUE : (existingStyleName ?? '')
  )
  const [customStyleName, setCustomStyleName] = useState(isExistingCustom ? existingStyleName : '')
  const [customStyleColour, setCustomStyleColour] = useState(
    isExistingCustom
      ? (styles.find((s) => s.name === existingStyleName)?.hex_colour ?? '#E09020')
      : '#E09020'
  )

  const [tag, setTag] = useState<RecipeTag | null>(recipe?.tag ?? null)
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [name, setName] = useState(recipe?.name ?? '')
  const [targetAbv, setTargetAbv] = useState(recipe?.target_abv?.toString() ?? '')
  const [targetOg, setTargetOg] = useState(recipe?.target_og_plato?.toString() ?? '')
  const [targetFg, setTargetFg] = useState(recipe?.target_fg_plato?.toString() ?? '')
  const [targetIbu, setTargetIbu] = useState(recipe?.target_ibu?.toString() ?? '')
  const [targetEbc, setTargetEbc] = useState(recipe?.target_ebc?.toString() ?? '')
  const [brewVolume, setBrewVolume] = useState(recipe?.brew_volume_l?.toString() ?? '')
  const [foundationL, setFoundationL] = useState(recipe?.foundation_l?.toString() ?? '')
  const [spargeL, setSpargeL] = useState(recipe?.sparge_l?.toString() ?? '')
  const [boilMin, setBoilMin] = useState(recipe?.boil_duration_min?.toString() ?? '')
  const [mashTemp, setMashTemp] = useState(recipe?.mash_temp_c?.toString() ?? '')
  const [pitchTemp, setPitchTemp] = useState(recipe?.pitch_temp_c?.toString() ?? '')
  const [fermentTemp, setFermentTemp] = useState(recipe?.ferment_temp_c?.toString() ?? '')
  const [draftIngredients, setDraftIngredients] = useState<DraftIngredient[]>(
    recipe?.ingredients ? ingredientsToDraft(recipe.ingredients) : []
  )

  const effectiveStyle =
    styleSelect === CUSTOM_STYLE_VALUE ? customStyleName.trim() : styleSelect

  function addIngredient(stage: AdditionStage) {
    setDraftIngredients((prev) => [...prev, blankIngredient(stage, prev.length)])
  }
  function removeIngredient(key: string) {
    setDraftIngredients((prev) => prev.filter((i) => i._key !== key))
  }
  function updateIngredient(key: string, field: keyof DraftIngredient, value: string) {
    setDraftIngredients((prev) => prev.map((i) => (i._key === key ? { ...i, [field]: value } : i)))
  }
  function handleIngredientSelect(key: string, value: string, option?: IngredientOption) {
    setDraftIngredients((prev) =>
      prev.map((i) => {
        if (i._key !== key) return i
        return {
          ...i,
          name: value,
          ingredient_id: option?.id ?? null,
          category: option?.category ?? i.category,
          unit: option?.default_unit ?? i.unit,
        }
      })
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Recipe name is required.'); return }
    if (styleSelect === CUSTOM_STYLE_VALUE && !customStyleName.trim()) {
      setError('Please enter a name for your custom style.'); return
    }
    setError(null)

    const data: RecipeFormData = {
      name, style: effectiveStyle,
      tag,
      customStyleColour: styleSelect === CUSTOM_STYLE_VALUE ? customStyleColour : null,
      target_abv: targetAbv, target_og_plato: targetOg, target_fg_plato: targetFg,
      target_ibu: targetIbu, target_ebc: targetEbc,
      brew_volume_l: brewVolume, foundation_l: foundationL, sparge_l: spargeL,
      boil_duration_min: boilMin, mash_temp_c: mashTemp, pitch_temp_c: pitchTemp,
      ferment_temp_c: fermentTemp, notes,
      ingredients: draftIngredients.map((ing, i) => {
        const qty = parseFloat(ing.quantity)
        const mins = global.parseInt(ing.time_minutes, 10)
        return {
          ingredient_id: ing.ingredient_id,
          name: ing.name,
          category: ing.category,
          addition_stage: ing.addition_stage,
          quantity: ing.quantity && !isNaN(qty) ? qty : null,
          unit: ing.unit || null,
          time_minutes: ing.time_minutes && !isNaN(mins) ? mins : null,
          trigger: ing.trigger || null,
          sort_order: i,
        }
      }),
    }

    startTransition(async () => {
      try {
        if (recipe?.id) { await updateRecipe(recipe.id, data) }
        else { await createRecipe(data) }
      } catch (err: unknown) {
        const e = err as { message?: string; code?: string; hint?: string }
        const msg = e?.message ?? (err instanceof Error ? err.message : 'Something went wrong.')
        const detail = e?.hint ? ` (${e.hint})` : e?.code ? ` [${e.code}]` : ''
        setError(msg + detail)
      }
    })
  }

  const stageIngredients = (stage: AdditionStage) =>
    draftIngredients.filter((i) => i.addition_stage === stage)
  const showTime = (stage: AdditionStage) => stage === 'kettle_hop' || stage === 'mash_hop'
  const showTrigger = (stage: AdditionStage) => stage === 'dry_hop' || stage === 'kettle_addition'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Left: Basic info */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recipe Info</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tropical IPA"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Style</label>
            <div className="flex items-center gap-2">
              {styleSelect && styleSelect !== CUSTOM_STYLE_VALUE && (
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0 border border-gray-200"
                  style={{ backgroundColor: styles.find((s) => s.name === styleSelect)?.hex_colour ?? '#888' }}
                />
              )}
              <select
                value={styleSelect}
                onChange={(e) => setStyleSelect(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                <option value="">— Select style —</option>
                {styles.map((s) => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
                <option value={CUSTOM_STYLE_VALUE}>＋ Add custom style…</option>
              </select>
            </div>

            {styleSelect === CUSTOM_STYLE_VALUE && (
              <StylePicker
                name={customStyleName}
                colour={customStyleColour}
                onNameChange={setCustomStyleName}
                onColourChange={setCustomStyleColour}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Tag</label>
            <div className="flex flex-wrap gap-2">
              {RECIPE_TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(tag === t ? null : t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    tag === t
                      ? RECIPE_TAG_COLOURS[t]
                      : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  {RECIPE_TAG_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Brewer notes, special instructions…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>
        </div>

        {/* Right: Targets + Process */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Targets</h2>
            <div className="grid grid-cols-5 gap-3">
              <Field label="ABV %" value={targetAbv} onChange={setTargetAbv} step="0.1" />
              <Field label="OG °P" value={targetOg} onChange={setTargetOg} step="0.1" />
              <Field label="FG °P" value={targetFg} onChange={setTargetFg} step="0.1" />
              <Field label="IBU" value={targetIbu} onChange={setTargetIbu} step="1" />
              <Field label="EBC" value={targetEbc} onChange={setTargetEbc} step="1" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Process</h2>
            <div className="grid grid-cols-4 gap-3">
              <Field label="Brew Vol (L)" value={brewVolume} onChange={setBrewVolume} />
              <Field label="Foundation (L)" value={foundationL} onChange={setFoundationL} />
              <Field label="Sparge (L)" value={spargeL} onChange={setSpargeL} />
              <Field label="Boil (min)" value={boilMin} onChange={setBoilMin} step="1" />
              <Field label="Mash Temp °C" value={mashTemp} onChange={setMashTemp} step="0.5" />
              <Field label="Pitch Temp °C" value={pitchTemp} onChange={setPitchTemp} step="0.5" />
              <Field label="Ferment °C" value={fermentTemp} onChange={setFermentTemp} step="0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Ingredients</h2>
        {ADDITION_STAGE_ORDER.map((stage) => {
          const rows = stageIngredients(stage)
          return (
            <div key={stage}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {ADDITION_STAGE_LABELS[stage]}
                </h3>
                <button
                  type="button"
                  onClick={() => addIngredient(stage)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              {rows.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 w-16">Unit</th>
                        {showTime(stage) && (
                          <th className="px-3 py-2 text-right font-medium text-gray-500 w-16">Min</th>
                        )}
                        {showTrigger(stage) && (
                          <th className="px-3 py-2 text-left font-medium text-gray-500 w-24">Trigger</th>
                        )}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((ing) => (
                        <tr key={ing._key} className="border-b border-gray-50 last:border-0">
                          <td className="px-2 py-1.5">
                            <IngredientAutocomplete
                              value={ing.name}
                              onChange={(val, opt) => handleIngredientSelect(ing._key, val, opt)}
                              ingredients={ingredients}
                              placeholder="Ingredient name"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={ing.quantity}
                              onChange={(e) => updateIngredient(ing._key, 'quantity', e.target.value)}
                              placeholder="0"
                              step="0.001"
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={ing.unit}
                              onChange={(e) => updateIngredient(ing._key, 'unit', e.target.value)}
                              placeholder="kg"
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
                            />
                          </td>
                          {showTime(stage) && (
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                value={ing.time_minutes}
                                onChange={(e) => updateIngredient(ing._key, 'time_minutes', e.target.value)}
                                placeholder="60"
                                step="1"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
                              />
                            </td>
                          )}
                          {showTrigger(stage) && (
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                value={ing.trigger}
                                onChange={(e) => updateIngredient(ing._key, 'trigger', e.target.value)}
                                placeholder="e.g. 5°P"
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
                              />
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeIngredient(ing._key)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rows.length === 0 && (
                <p className="text-xs text-gray-400 italic pl-1">None added</p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-medium px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {recipe ? 'Save Changes' : 'Create Recipe'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, value, onChange, step = '0.01' }: {
  label: string; value: string; onChange: (v: string) => void; step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </div>
  )
}
