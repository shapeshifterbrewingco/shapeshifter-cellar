'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, Trash2 } from 'lucide-react'
import { FORMAT_ORDER, FORMAT_META, CLARITY_LABELS } from '@/lib/costing'
import type { Clarity } from '@/lib/costing'
import type { AppSettings, PackageFormat } from '@/types'
import {
  saveMaterial, deleteMaterial, setMaterialUsage,
  saveAdditive, deleteAdditive, saveOverheads,
} from './actions'
import type { MaterialRow, AdditiveRow } from './actions'
import { PackagingImport } from './PackagingImport'
import { MATERIAL_CATEGORY_LABELS } from '@/lib/packaging-materials'
import type { MaterialCategory } from '@/lib/packaging-materials'

interface Props {
  materials: MaterialRow[]
  additives: AdditiveRow[]
  ingredients: { id: string; name: string; category: string }[]
  settings: AppSettings
}

export function SetupView({ materials, additives, ingredients, settings }: Props) {
  return (
    <div className="space-y-5">
      <OverheadsCard settings={settings} />
      <PackagingImport />
      <MaterialsCard materials={materials} />
      <AdditivesCard additives={additives} ingredients={ingredients} />
    </div>
  )
}

// ── Overheads ──────────────────────────────────────────────

function OverheadsCard({ settings }: { settings: AppSettings }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [f, setF] = useState({
    labour: String(settings.overhead_labour_per_batch ?? 0),
    energy: String(settings.overhead_energy_per_batch ?? 0),
    chemicals: String(settings.overhead_chemicals_per_batch ?? 0),
    water: String(settings.overhead_water_per_batch ?? 0),
    otherPerL: String(settings.overhead_other_per_l ?? 0),
    loss: String(settings.default_loss_pct ?? 10),
    clarity: (settings.default_clarity ?? 'bright') as Clarity,
  })

  const total =
    (parseFloat(f.labour) || 0) + (parseFloat(f.energy) || 0) +
    (parseFloat(f.chemicals) || 0) + (parseFloat(f.water) || 0)

  function save() {
    startTransition(async () => {
      await saveOverheads({
        overhead_labour_per_batch: parseFloat(f.labour) || 0,
        overhead_energy_per_batch: parseFloat(f.energy) || 0,
        overhead_chemicals_per_batch: parseFloat(f.chemicals) || 0,
        overhead_water_per_batch: parseFloat(f.water) || 0,
        overhead_other_per_l: parseFloat(f.otherPerL) || 0,
        default_loss_pct: parseFloat(f.loss) || 0,
        default_clarity: f.clarity,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    })
  }

  return (
    <Card title="Overheads and defaults"
      note="Overheads are spread across the litres that get packaged, then split between formats by volume. Leave a line at zero to keep it out of the cost.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Num label="Labour $/batch" value={f.labour} onChange={(v) => setF({ ...f, labour: v })} />
        <Num label="Energy $/batch" value={f.energy} onChange={(v) => setF({ ...f, energy: v })} />
        <Num label="Chemicals $/batch" value={f.chemicals} onChange={(v) => setF({ ...f, chemicals: v })} />
        <Num label="Water $/batch" value={f.water} onChange={(v) => setF({ ...f, water: v })} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Num label="Other $/L" value={f.otherPerL} step="0.01" onChange={(v) => setF({ ...f, otherPerL: v })} />
        <Num label="Default loss %" value={f.loss} step="0.5" onChange={(v) => setF({ ...f, loss: v })} />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Default clarity</label>
          <select
            value={f.clarity}
            onChange={(e) => setF({ ...f, clarity: e.target.value as Clarity })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {(['bright', 'hazy'] as Clarity[]).map((c) => (
              <option key={c} value={c}>{CLARITY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={save} disabled={busy}
            className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Fixed overhead per batch: <span className="font-medium text-gray-600">${total.toFixed(2)}</span>
      </p>
    </Card>
  )
}

// ── Packaging materials ────────────────────────────────────

function MaterialsCard({ materials }: { materials: MaterialRow[] }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const unpriced = materials.filter((m) => m.is_active && m.price_per_unit == null).length

  function refresh() { router.refresh() }

  return (
    <Card
      title="Packaging materials"
      note="Price per single item. Cans, ends and labels are per can, not per carton — the per-carton quantity is set in the columns on the right."
    >
      {unpriced > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          {unpriced} material{unpriced === 1 ? '' : 's'} still unpriced. Anything without a price is
          left out of the unit cost and flagged on the costing screen, rather than counted as free.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-1.5">Material</th>
              <th className="text-left font-medium py-1.5 w-28">Supplier</th>
              <th className="text-right font-medium py-1.5 w-24">Price</th>
              {FORMAT_ORDER.map((f) => (
                <th key={f} className="text-right font-medium py-1.5 w-16">
                  {FORMAT_META[f].isKeg ? FORMAT_META[f].label.replace('Keg ', '') : f.split('x')[0] + 'pk'}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <MaterialRowEditor key={m.id} m={m} busy={busy} start={startTransition} refresh={refresh} />
            ))}
          </tbody>
        </table>
      </div>

      {adding
        ? <NewMaterial onDone={() => { setAdding(false); refresh() }} />
        : (
          <button
            onClick={() => setAdding(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            <Plus className="h-3 w-3" />
            Add material
          </button>
        )}
    </Card>
  )
}

function MaterialRowEditor({ m, busy, start, refresh }: {
  m: MaterialRow; busy: boolean
  start: (cb: () => void) => void; refresh: () => void
}) {
  const [price, setPrice] = useState(m.price_per_unit != null ? String(m.price_per_unit) : '')
  const [supplier, setSupplier] = useState(m.supplier ?? '')
  const usageFor = (f: PackageFormat) => m.usage.find((u) => u.format === f)?.qty_per_unit ?? 0

  function commit() {
    start(async () => {
      await saveMaterial({
        id: m.id, name: m.name, category: m.category, unit: m.unit,
        price_per_unit: price === '' ? null : parseFloat(price),
        supplier: supplier || null, supplier_code: m.supplier_code, is_active: m.is_active,
      })
      refresh()
    })
  }

  function commitUsage(f: PackageFormat, v: string) {
    start(async () => {
      await setMaterialUsage(m.id, f, parseFloat(v) || 0)
      refresh()
    })
  }

  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-1.5">
        <span className="text-gray-800">{m.name}</span>
        <span className="text-xs text-gray-400 ml-2">{MATERIAL_CATEGORY_LABELS[m.category]}</span>
      </td>
      <td className="py-1.5">
        <input
          value={supplier} onChange={(e) => setSupplier(e.target.value)} onBlur={commit}
          placeholder="—"
          className="w-full border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-1.5 py-1 text-xs"
        />
      </td>
      <td className="py-1.5">
        <div className="flex items-center justify-end gap-0.5">
          <span className="text-xs text-gray-400">$</span>
          <input
            type="number" step="0.0001" min="0" value={price}
            onChange={(e) => setPrice(e.target.value)} onBlur={commit}
            placeholder="—"
            className={`w-16 text-right tabular-nums border rounded px-1.5 py-1 text-sm ${
              price === '' ? 'border-amber-300 bg-amber-50' : 'border-transparent hover:border-gray-200'
            }`}
          />
        </div>
      </td>
      {FORMAT_ORDER.map((f) => (
        <td key={f} className="py-1.5">
          <input
            type="number" min="0" step="1" defaultValue={usageFor(f) || ''}
            onBlur={(e) => commitUsage(f, e.target.value)}
            placeholder="0"
            disabled={busy}
            className="w-12 text-right tabular-nums border border-transparent hover:border-gray-200 rounded px-1 py-1 text-xs"
          />
        </td>
      ))}
      <td className="py-1.5 text-right">
        <button
          onClick={() => start(async () => { await deleteMaterial(m.id); refresh() })}
          className="text-gray-300 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

function NewMaterial({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<MaterialCategory>('other')
  const [price, setPrice] = useState('')
  const [, start] = useTransition()

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
      <div className="flex-1 min-w-[140px]">
        <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
        <select value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
          {(Object.keys(MATERIAL_CATEGORY_LABELS) as MaterialCategory[]).map((c) => (
            <option key={c} value={c}>{MATERIAL_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Price</label>
        <input type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)}
          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm tabular-nums" />
      </div>
      <button
        onClick={() => start(async () => {
          if (!name.trim()) return
          await saveMaterial({
            name: name.trim(), category, unit: 'each',
            price_per_unit: price === '' ? null : parseFloat(price),
            supplier: null, supplier_code: null, is_active: true,
          })
          onDone()
        })}
        className="text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90"
      >
        Add
      </button>
      <button onClick={onDone} className="text-sm text-gray-500 px-2 py-1.5">Cancel</button>
    </div>
  )
}

// ── Clarity additives ──────────────────────────────────────

function AdditivesCard({ additives, ingredients }: {
  additives: AdditiveRow[]
  ingredients: { id: string; name: string; category: string }[]
}) {
  const router = useRouter()
  const [, start] = useTransition()

  return (
    <Card
      title="Bright and hazy additives"
      note="What goes in on top of the recipe depending on the beer. Dosed per 1,000 L into tank. These are added to every costing automatically, so do not also list them in the recipe."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {(['bright', 'hazy'] as Clarity[]).map((c) => (
          <div key={c}>
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
              {CLARITY_LABELS[c]}
            </h4>

            <div className="space-y-1 mb-2">
              {additives.filter((a) => a.clarity === c).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 text-sm border-b border-gray-50 pb-1">
                  <span className="text-gray-800 truncate">
                    {a.ingredient_name}
                    {!a.has_price && <span className="text-amber-600 text-xs ml-1.5">no price</span>}
                  </span>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <span className="text-xs text-gray-500 tabular-nums">
                      {a.qty_per_1000l} {a.unit}/1000 L
                    </span>
                    <button
                      onClick={() => start(async () => { await deleteAdditive(a.id); router.refresh() })}
                      className="text-gray-300 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              ))}
              {additives.filter((a) => a.clarity === c).length === 0 && (
                <p className="text-xs text-gray-400 italic">Nothing set.</p>
              )}
            </div>

            <AddAdditive clarity={c} ingredients={ingredients} onDone={() => router.refresh()} />
          </div>
        ))}
      </div>
    </Card>
  )
}

function AddAdditive({ clarity, ingredients, onDone }: {
  clarity: Clarity
  ingredients: { id: string; name: string; category: string }[]
  onDone: () => void
}) {
  const [ingredientId, setIngredientId] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('g')
  const [, start] = useTransition()

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      <select
        value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}
        className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
      >
        <option value="">Ingredient…</option>
        {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <input
        type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)}
        placeholder="qty"
        className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs tabular-nums"
      />
      <select
        value={unit} onChange={(e) => setUnit(e.target.value)}
        className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs bg-white"
      >
        {['g', 'kg', 'mL', 'L', 'each'].map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
      <button
        onClick={() => start(async () => {
          if (!ingredientId || !qty) return
          await saveAdditive({
            clarity, ingredient_id: ingredientId,
            qty_per_1000l: parseFloat(qty), unit, notes: null,
          })
          setIngredientId(''); setQty('')
          onDone()
        })}
        className="text-xs font-medium border border-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-50"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

// ── Shared ─────────────────────────────────────────────────

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      {note && <p className="text-xs text-gray-400 mt-1 mb-3">{note}</p>}
      {children}
    </section>
  )
}

function Num({ label, value, onChange, step = '1' }: {
  label: string; value: string; onChange: (v: string) => void; step?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number" step={step} min="0" value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums"
      />
    </div>
  )
}
