'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2, FileText, Sparkles } from 'lucide-react'
import { RecipeForm } from '@/components/recipes/RecipeForm'
import { IngredientMatchStep } from './IngredientMatchStep'
import type { MatchableIngredient, ResolvedIngredient } from './IngredientMatchStep'
import type { IngredientOption } from '@/components/recipes/IngredientAutocomplete'
import type { Recipe, AdditionStage, IngredientCategory } from '@/types'
import type { ParsedRecipe } from '@/app/api/parse-recipe/route'

interface Props {
  styles: { name: string; hex_colour: string }[]
  ingredients: IngredientOption[]
}

const CATEGORY_MAP: Record<string, IngredientCategory> = {
  malt: 'malt', malts: 'malt', grain: 'malt', grains: 'malt', base_malt: 'malt', specialty_malt: 'malt', roasted: 'malt',
  hop: 'hop', hops: 'hop', pellet: 'hop', pellets: 'hop',
  yeast: 'yeast', yeast_nutrient: 'yeast',
  adjunct: 'adjunct', adjuncts: 'adjunct', sugar: 'adjunct', fruit: 'adjunct', spice: 'adjunct', extract: 'adjunct',
  fining: 'finings', finings: 'finings', clarifier: 'finings', clarifying: 'finings', gelatin: 'finings', isinglass: 'finings',
  water: 'water_treatment', water_treatment: 'water_treatment', mineral: 'water_treatment', salt: 'water_treatment', acid: 'water_treatment',
  other: 'other', misc: 'other', process: 'other', chemical: 'other',
}

const STAGE_MAP: Record<string, AdditionStage> = {
  malt: 'malt', grain: 'malt', grist: 'malt',
  mash_addition: 'mash_addition', mash_adjunct: 'mash_addition',
  mash_hop: 'mash_hop', first_wort: 'mash_hop', first_wort_hop: 'mash_hop',
  kettle_addition: 'kettle_addition', kettle_adjunct: 'kettle_addition', flameout: 'kettle_addition',
  kettle_hop: 'kettle_hop', bittering: 'kettle_hop', flavour: 'kettle_hop', flavor: 'kettle_hop', whirlpool: 'kettle_hop', aroma: 'kettle_hop',
  dry_hop: 'dry_hop', dryhop: 'dry_hop', dry: 'dry_hop',
  yeast: 'yeast', fermentation: 'yeast',
  process: 'process', fining: 'process', clarifying: 'process', packaging: 'process',
}

function normalizeCategory(raw: string | null | undefined): IngredientCategory {
  return CATEGORY_MAP[raw?.toLowerCase().trim() ?? ''] ?? 'other'
}

function normalizeStage(raw: string | null | undefined): AdditionStage {
  return STAGE_MAP[raw?.toLowerCase().trim().replace(/[\s-]/g, '_') ?? ''] ?? 'malt'
}

function autoMatch(name: string, options: IngredientOption[]): IngredientOption | null {
  const n = name.toLowerCase().trim()
  if (!n) return null
  const exact = options.find(o => o.name.toLowerCase() === n)
  if (exact) return exact
  // DB name contained within parsed name (e.g., "Cascade" in "Cascade (Pellets) 2024")
  const dbInParsed = options.find(o => n.includes(o.name.toLowerCase()) && o.name.length >= 4)
  if (dbInParsed) return dbInParsed
  // Parsed name contained within DB name
  const parsedInDb = options.find(o => o.name.toLowerCase().includes(n) && n.length >= 4)
  if (parsedInDb) return parsedInDb
  return null
}

type Step = 'upload' | 'matching' | 'form'

export function RecipeImportForm({ styles, ingredients }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('upload')
  const [matchItems, setMatchItems] = useState<MatchableIngredient[]>([])
  const [parsedBase, setParsedBase] = useState<Partial<Recipe> | null>(null)
  const [finalRecipe, setFinalRecipe] = useState<Partial<Recipe> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleParse(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setParsing(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/parse-recipe', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Parse failed')

      const p = json.recipe as ParsedRecipe
      const base: Partial<Recipe> = {
        name: p.name ?? '',
        style: p.style ?? null,
        target_abv: p.target_abv ?? null,
        target_og_plato: p.target_og_plato ?? null,
        target_fg_plato: p.target_fg_plato ?? null,
        target_ibu: p.target_ibu ?? null,
        target_ebc: p.target_ebc ?? null,
        brew_volume_l: p.brew_volume_l ?? null,
        foundation_l: p.foundation_l ?? null,
        sparge_l: p.sparge_l ?? null,
        boil_duration_min: p.boil_duration_min ?? null,
        mash_temp_c: p.mash_temp_c ?? null,
        pitch_temp_c: p.pitch_temp_c ?? null,
        ferment_temp_c: p.ferment_temp_c ?? null,
        notes: p.notes ?? null,
      }
      setParsedBase(base)

      const items: MatchableIngredient[] = (p.ingredients ?? []).map((ing, i) => ({
        key: `ing-${i}`,
        parsedName: ing.name ?? '',
        category: normalizeCategory(ing.category),
        addition_stage: normalizeStage(ing.addition_stage),
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        time_minutes: ing.time_minutes ?? null,
        trigger: ing.trigger ?? null,
        autoMatch: autoMatch(ing.name ?? '', ingredients),
      }))

      if (items.length === 0) {
        // No ingredients — skip matching step
        setFinalRecipe({ ...base, ingredients: [] })
        setStep('form')
      } else {
        setMatchItems(items)
        setStep('matching')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setParsing(false)
    }
  }

  function handleMatchProceed(resolved: ResolvedIngredient[]) {
    if (!parsedBase) return
    const recipeIngredients: Recipe['ingredients'] = resolved.map((r, i) => ({
      id: `draft-${i}`,
      recipe_id: '',
      ingredient_id: r.ingredient_id,
      name: r.name,
      category: r.category,
      addition_stage: r.addition_stage,
      quantity: r.quantity,
      unit: r.unit,
      time_minutes: r.time_minutes,
      trigger: r.trigger,
      sort_order: i,
    }))
    setFinalRecipe({ ...parsedBase, ingredients: recipeIngredients })
    setStep('form')
  }

  if (step === 'form' && finalRecipe) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-bold text-gray-900">Review & Save Imported Recipe</h1>
          <button
            type="button"
            onClick={() => { setStep('matching'); setFinalRecipe(null) }}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          >
            ← Back to ingredient matching
          </button>
        </div>
        <RecipeForm
          recipe={finalRecipe as unknown as Recipe}
          styles={styles}
          ingredients={ingredients}
        />
      </div>
    )
  }

  if (step === 'matching') {
    return (
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Sparkles className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-bold text-gray-900">Match Ingredients</h1>
        </div>
        <IngredientMatchStep
          items={matchItems}
          allIngredients={ingredients}
          onProceed={handleMatchProceed}
          onBack={() => { setStep('upload'); setMatchItems([]); setParsedBase(null) }}
        />
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Import Recipe from PDF</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload a brew sheet, recipe card, or any document — AI will read it and pre-fill the recipe form for you to review and save.
      </p>

      <form onSubmit={handleParse} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-gray-50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-gray-800">{file.name}</span>
            </div>
          ) : (
            <>
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Click to select file</p>
              <p className="text-xs text-gray-400 mt-1">PDF, PNG, JPG, WEBP</p>
            </>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={parsing || !file}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-medium py-2.5 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {parsing ? 'Reading recipe…' : 'Import Recipe'}
        </button>
      </form>
    </div>
  )
}
