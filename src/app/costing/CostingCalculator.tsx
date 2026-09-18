'use client'

import { Fragment, useState, useEffect, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, Save, Wand2, Link2 } from 'lucide-react'
import {
  calculateCosting, suggestSplit, EMPTY_SPLIT, formatMoney,
  FORMAT_ORDER, FORMAT_META, CLARITY_LABELS, GAP_LABELS,
} from '@/lib/costing'
import type { Clarity, SplitQuantities, CostingResult, CostLine } from '@/lib/costing'
import { FixLine, FixMaterial } from './FixLine'
import { AmbiguousUnits } from './AmbiguousUnits'
import type { ExciseCategory } from '@/types'
import { EXCISE_CATEGORY_LABELS } from '@/types'
import {
  getRecipeCostInputs, getClarityAdditives, saveCostSnapshot,
} from './actions'
import type { RecipeOption, CostingReference, RecipeCostInputs } from './actions'
import type { ClarityAdditive } from '@/lib/costing'
import type { SplitPrefill } from './actions'

interface Props {
  recipes: RecipeOption[]
  reference: CostingReference
  prefills: SplitPrefill[]
}

export function CostingCalculator({ recipes, reference, prefills }: Props) {
  const [recipeId, setRecipeId] = useState<string>(recipes[0]?.id ?? '')
  const [inputs, setInputs] = useState<RecipeCostInputs | null>(null)
  const [additives, setAdditives] = useState<ClarityAdditive[]>([])
  const [loading, setLoading] = useState(false)

  const [volume, setVolume] = useState('')
  const [lossPct, setLossPct] = useState(String(reference.defaultLossPct))
  const [clarity, setClarity] = useState<Clarity>(reference.defaultClarity)
  const [scaleToTank, setScaleToTank] = useState(true)
  const [abv, setAbv] = useState('')
  const [exciseCat, setExciseCat] = useState<ExciseCategory>('standard')
  const [split, setSplit] = useState<SplitQuantities>(EMPTY_SPLIT)
  const [brewId, setBrewId] = useState<string | null>(null)

  const [saved, setSaved] = useState(false)
  const [, startTransition] = useTransition()

  const recipe = recipes.find((r) => r.id === recipeId) ?? null

  // Load the recipe's priced ingredients. `reloadKey` bumps after an inline
  // fix so the cost reflects the change without a page reload.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let live = true
    // State changes stay inside the async callbacks so the effect does not
    // set state synchronously on mount and trigger a cascading render.
    ;(async () => {
      if (!recipeId) { setInputs(null); return }
      setLoading(true)
      try {
        const i = await getRecipeCostInputs(recipeId)
        if (!live) return
        setInputs(i)
        setVolume((v) => v || (i.recipeVolumeL != null ? String(i.recipeVolumeL) : ''))
        setAbv((a) => a || (i.targetAbv != null ? String(i.targetAbv) : ''))
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [recipeId, reloadKey])

  function reload() {
    setReloadKey((k) => k + 1)
    getClarityAdditives(clarity).then(setAdditives)
  }

  // Load the additive template for bright or hazy
  useEffect(() => {
    getClarityAdditives(clarity).then(setAdditives)
  }, [clarity])

  const volumeNum = parseFloat(volume) || 0
  const lossNum = parseFloat(lossPct) || 0
  const abvNum = parseFloat(abv)

  const result: CostingResult | null = useMemo(() => {
    if (!inputs || volumeNum <= 0) return null
    return calculateCosting({
      recipeVolumeL: inputs.recipeVolumeL,
      volumeIntoTankL: volumeNum,
      lossPct: lossNum,
      clarity,
      scaleToTank,
      ingredients: inputs.ingredients,
      additives,
      split,
      materials: reference.materials,
      overheads: reference.overheads,
      canning: reference.canning,
      excise: reference.excise,
      abv: isNaN(abvNum) ? null : abvNum,
      exciseCategory: exciseCat,
    })
  }, [inputs, volumeNum, lossNum, clarity, scaleToTank, additives, split, reference, abvNum, exciseCat])

  function applyPrefill(p: SplitPrefill) {
    setBrewId(p.brewId)
    if (p.recipeId) setRecipeId(p.recipeId)
    if (p.volumeIntoTankL != null) setVolume(String(p.volumeIntoTankL))
    if (p.lossPct != null) setLossPct(String(p.lossPct))
    if (p.clarity) setClarity(p.clarity)
    if (p.abv != null) setAbv(String(p.abv))
    if (p.exciseCategory) setExciseCat(p.exciseCategory as ExciseCategory)
    setSplit(p.qty)
  }

  function handleSave() {
    if (!result) return
    startTransition(async () => {
      await saveCostSnapshot({
        recipeId: recipeId || null,
        brewId,
        label: recipe ? `${recipe.name} · ${volumeNum} L` : null,
        inputs: { volumeNum, lossNum, clarity, scaleToTank, split, abv: abvNum, exciseCat },
        result,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  const unlinkedCount = inputs?.ingredients.filter((i) => i.ingredientId == null).length ?? 0

  return (
    <div className="space-y-5">

      {/* ── Inputs ────────────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Batch</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Recipe</label>
            <select
              value={recipeId}
              onChange={(e) => { setRecipeId(e.target.value); setBrewId(null) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a recipe…</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>{r.name} v{r.version}</option>
              ))}
            </select>
          </div>

          {prefills.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Or load a planned batch
              </label>
              <select
                value={brewId ?? ''}
                onChange={(e) => {
                  const p = prefills.find((x) => x.brewId === e.target.value)
                  if (p) applyPrefill(p)
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Packaging plans…</option>
                {prefills.map((p) => (
                  <option key={p.brewId} value={p.brewId}>{p.beerName}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <NumField label="Volume into tank (L)" value={volume} onChange={setVolume} step="10" bold />
          <NumField label="Expected loss %" value={lossPct} onChange={setLossPct} step="0.5" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Clarity</label>
            <div className="flex gap-1">
              {(['bright', 'hazy'] as Clarity[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClarity(c)}
                  className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                    clarity === c
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {CLARITY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>
          <NumField label="ABV %" value={abv} onChange={setAbv} step="0.1" />
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-100">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={scaleToTank}
              onChange={(e) => setScaleToTank(e.target.checked)}
              className="rounded border-gray-300"
            />
            Scale recipe to tank volume
            {result && result.scaleFactor !== 1 && (
              <span className="text-gray-400">(× {result.scaleFactor.toFixed(3)})</span>
            )}
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Excise</span>
            <select
              value={exciseCat}
              onChange={(e) => setExciseCat(e.target.value as ExciseCategory)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
            >
              {(Object.keys(EXCISE_CATEGORY_LABELS) as ExciseCategory[]).map((c) => (
                <option key={c} value={c}>{EXCISE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {unlinkedCount > 0 && (
            <Link
              href="/costing/match"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100"
            >
              <Link2 className="h-3 w-3" />
              {unlinkedCount} ingredient{unlinkedCount === 1 ? '' : 's'} not linked to a price
            </Link>
          )}
        </div>
      </section>

      {recipeId && <AmbiguousUnits key={`${recipeId}-${reloadKey}`} recipeId={recipeId} onResolved={reload} />}

      {/* ── Packaging split ───────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Packaging split</h2>
          <button
            type="button"
            onClick={() => setSplit(suggestSplit(volumeNum * (1 - lossNum / 100)))}
            disabled={volumeNum <= 0}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <Wand2 className="h-3 w-3" />
            Fill 50/50
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {FORMAT_ORDER.map((f) => (
            <div key={f}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {FORMAT_META[f].label}
                <span className="text-gray-400 ml-1">
                  {FORMAT_META[f].isKeg ? 'kegs' : 'cartons'}
                </span>
              </label>
              <input
                type="number" min="0" value={split[f] || ''}
                onChange={(e) => setSplit({ ...split, [f]: Math.max(0, parseInt(e.target.value) || 0) })}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums"
              />
            </div>
          ))}
        </div>

        {result && (
          <VolumeBar result={result} />
        )}
      </section>

      {/* ── Result ────────────────────────────────────────── */}
      {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading recipe…</p>}

      {!loading && !result && (
        <p className="text-sm text-gray-400 py-8 text-center">
          Pick a recipe and enter the volume that went into the tank.
        </p>
      )}

      {result && <ResultPanel result={result} onSave={handleSave} saved={saved} onFixed={reload} />}
    </div>
  )
}

// ── Volume allocation bar ──────────────────────────────────

function VolumeBar({ result }: { result: CostingResult }) {
  const over = result.unallocatedL < -0.01
  const under = result.unallocatedL > 0.01

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <Fact label="Into tank" value={`${result.volumeIntoTankL.toFixed(0)} L`} />
        <Fact label="Loss" value={`${result.lossL.toFixed(0)} L`} />
        <Fact label="Packaged" value={`${result.packagedVolumeL.toFixed(0)} L`} />
        <Fact label="Allocated" value={`${result.allocatedVolumeL.toFixed(0)} L`} />
      </div>

      {(over || under) && result.allocatedVolumeL > 0 && (
        <p className={`text-xs flex items-start gap-1.5 ${over ? 'text-red-600' : 'text-amber-600'}`}>
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
          {over
            ? `The split is ${Math.abs(result.unallocatedL).toFixed(0)} L more than the batch yields.`
            : `${result.unallocatedL.toFixed(0)} L of the batch is not in the split. Its cost is carried by the units above, so the unit cost is higher than it should be.`}
        </p>
      )}
    </div>
  )
}

// ── Results ────────────────────────────────────────────────

function ResultPanel({ result, onSave, saved, onFixed }: {
  result: CostingResult; onSave: () => void; saved: boolean; onFixed: () => void
}) {
  const used = result.formats.filter((f) => f.qty > 0)
  const shown = used.length > 0 ? used : result.formats

  return (
    <>
      {result.gaps.length > 0 && (
        <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incomplete — {result.gaps.length} thing{result.gaps.length === 1 ? '' : 's'} missing
          </h3>
          <p className="text-xs text-amber-700 mb-2">
            These are excluded from the cost below, so the real cost is higher than shown.
          </p>
          <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
            {result.gaps.slice(0, 12).map((g) => <li key={g}>{g}</li>)}
            {result.gaps.length > 12 && <li>and {result.gaps.length - 12} more</li>}
          </ul>
        </section>
      )}

      {/* Headline per-unit costs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {shown.map((f) => (
          <div
            key={f.format}
            className={`rounded-xl p-4 border shadow-sm ${
              f.qty > 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-white border-gray-200'
            }`}
          >
            <p className={`text-[11px] font-medium ${f.qty > 0 ? 'text-white/70' : 'text-gray-400'}`}>
              {f.label}
            </p>
            <p className="text-2xl font-bold tabular-nums mt-1">{formatMoney(f.unitCost)}</p>
            <p className={`text-[11px] mt-0.5 ${f.qty > 0 ? 'text-white/70' : 'text-gray-400'}`}>
              per {f.format.startsWith('keg') ? 'keg' : 'carton'}
              {f.perCanCost != null && ` · ${formatMoney(f.perCanCost)}/can`}
            </p>
            <p className={`text-[11px] mt-2 pt-2 border-t tabular-nums ${
              f.qty > 0 ? 'text-white/70 border-white/20' : 'text-gray-400 border-gray-100'
            }`}>
              {formatMoney(f.perLitreCost)}/L
              {f.excisePerUnit != null && ` · excise ${formatMoney(f.excisePerUnit)}`}
            </p>
          </div>
        ))}
      </section>

      {/* Batch summary */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Batch total</h2>
          <button
            onClick={onSave}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90"
          >
            {saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
            {saved ? 'Saved' : 'Save snapshot'}
          </button>
        </div>

        <table className="w-full text-sm">
          <tbody>
            <Row label="Ingredients" value={result.ingredientCost} />
            <Row label={`Process additives (${CLARITY_LABELS[result.clarity].toLowerCase()})`} value={result.additiveCost} hide={result.additiveCost === 0} />
            <Row label="Packaging materials" value={result.materialsCost} />
            <Row label="Contract canning" value={result.canningCost} />
            <Row label="Overheads" value={result.overheadCost} />
            <tr className="border-t-2 border-gray-200">
              <td className="py-2 font-semibold text-gray-900">Total batch cost</td>
              <td className="py-2 text-right font-bold tabular-nums text-gray-900">
                {formatMoney(result.totalBatchCost)}
              </td>
            </tr>
            <tr>
              <td className="py-1 text-xs text-gray-500">Cost per packaged litre</td>
              <td className="py-1 text-right text-xs tabular-nums text-gray-600">
                {formatMoney(result.totalBatchCostPerL, 3)}
              </td>
            </tr>
            {result.exciseTotal != null && (
              <tr>
                <td className="py-1 text-xs text-gray-500">
                  Excise (shown separately, not in the cost above)
                </td>
                <td className="py-1 text-right text-xs tabular-nums text-gray-600">
                  {formatMoney(result.exciseTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Ingredient breakdown */}
      <Breakdown title="Ingredients" lines={result.ingredientLines} onFixed={onFixed} />
      {result.additiveLines.length > 0 && (
        <Breakdown title="Process additives" lines={result.additiveLines} onFixed={onFixed} />
      )}

      {/* Per-format make-up */}
      <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm overflow-x-auto">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          What makes up each unit
        </h2>
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Format</th>
              <th className="text-right font-medium py-1.5">Beer</th>
              <th className="text-right font-medium py-1.5">Materials</th>
              <th className="text-right font-medium py-1.5">Canning</th>
              <th className="text-right font-medium py-1.5">Overhead</th>
              <th className="text-right font-medium py-1.5">Unit cost</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <Fragment key={f.format}>
              <tr className="border-b border-gray-50 align-top">
                <td className="py-1.5 text-gray-800">
                  {f.label}
                  {f.qty > 0 && <span className="text-gray-400 ml-1.5">× {f.qty}</span>}
                  {!f.materialsComplete && (
                    <span className="text-amber-600 ml-1.5 text-xs">
                      {f.materialLines.filter((l) => l.gap).length} unpriced
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">{formatMoney(f.liquidCost)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">{formatMoney(f.materialsCost)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">{formatMoney(f.canningCost)}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-600">{formatMoney(f.overheadCost)}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-gray-900">{formatMoney(f.unitCost)}</td>
              </tr>
              {f.materialLines.some((l) => l.gap) && (
                <tr className="border-b border-gray-50">
                  <td colSpan={6} className="pb-3 pl-4">
                    <p className="text-[11px] text-gray-400 mb-1.5">
                      Missing from {f.label}. Each one makes the cost above too low.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {f.materialLines.filter((l) => l.gap && l.materialId).map((l) => (
                        <FixMaterial
                          key={l.materialId}
                          materialId={l.materialId!}
                          name={l.name}
                          detail={l.detail}
                          onFixed={onFixed}
                        />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

function Breakdown({ title, lines, onFixed }: {
  title: string; lines: CostLine[]; onFixed: () => void
}) {
  if (lines.length === 0) return null
  const priced = lines.filter((l) => l.gap == null).length
  const fixable = lines.length - priced

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <details open={priced < lines.length}>
        <summary className="text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer">
          {title} — {priced}/{lines.length} priced
          {fixable > 0 && (
            <span className="ml-2 font-normal normal-case tracking-normal text-amber-700">
              {fixable} to fix
            </span>
          )}
        </summary>
        <table className="w-full text-sm mt-3">
          <tbody>
            {lines.map((l, i) => (
              <tr key={`${l.name}-${i}`} className="border-b border-gray-50 last:border-0 align-top">
                <td className="py-1.5">
                  <span className={l.gap ? 'text-amber-700' : 'text-gray-800'}>{l.name}</span>
                  <span className="text-gray-400 text-xs ml-2">
                    {l.quantity != null ? `${l.quantity.toFixed(2)} ${l.unit ?? ''}` : 'no quantity'}
                  </span>
                  {l.gap && l.recipeIngredientId && (
                    <FixLine line={l} onFixed={onFixed} />
                  )}
                </td>
                <td className="py-1.5 text-right text-xs text-gray-400 whitespace-nowrap">
                  {l.pricePerUnit != null
                    ? `${formatMoney(l.pricePerUnit)}/${l.priceUnit}`
                    : ''}
                  {l.supplier && <span className="ml-1.5">{l.supplier}</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums w-24">
                  {l.cost != null
                    ? <span className="text-gray-800 font-medium">{formatMoney(l.cost)}</span>
                    : <span className="text-amber-600 text-xs">{GAP_LABELS[l.gap!]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}

// ── Small pieces ───────────────────────────────────────────

function NumField({ label, value, onChange, step = '1', bold = false }: {
  label: string; value: string; onChange: (v: string) => void; step?: string; bold?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number" step={step} min="0" value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          bold ? 'text-base font-bold text-gray-900' : 'text-sm'
        }`}
      />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-gray-500">
      {label} <span className="font-semibold text-gray-800 tabular-nums">{value}</span>
    </span>
  )
}

function Row({ label, value, hide }: { label: string; value: number; hide?: boolean }) {
  if (hide) return null
  return (
    <tr className="border-b border-gray-50">
      <td className="py-1.5 text-gray-600">{label}</td>
      <td className="py-1.5 text-right tabular-nums text-gray-800">{formatMoney(value)}</td>
    </tr>
  )
}
