'use client'

// The `latest` ref is only read and written inside event handlers and the
// autosave, never while rendering. The lint rule cannot see that through the
// field() and list() helpers, which build those handlers during render.
/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { importSheetReadings, applySheetToRecipe, cancelBrewDay } from '@/app/brews/sheet-actions'
import Link from 'next/link'
import { setTankTarget } from '@/app/tanks/actions'
import { useRouter } from 'next/navigation'
import { sheetProgress, bagsLabel, isDayZero, recipeChanges, sheetNumber } from '@/lib/brew-sheet'
import { dilution, spiritDose } from '@/lib/utils'
import type { BrewSheetData, ListKey, SheetLine, SheetReading } from '@/lib/brew-sheet'

type SaveInput = { brew_id: string; data: BrewSheetData; unchecked: string[]; source?: 'app' | 'photo'; finish?: boolean }

/** Save through a plain request, so the page is never re-rendered under the brewer's thumbs. */
async function postSheet(input: SaveInput): Promise<{ ok: true } | { ok: false; message: string }> {
  const send = () => fetch('/api/brew-sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  let res: Response
  try {
    res = await send()
  } catch {
    // A dropped request on brewery wifi is common and usually fine a moment later
    await new Promise((r) => setTimeout(r, 1500))
    res = await send()
  }
  // Signed out: the login page comes back instead of an answer
  if (!(res.headers.get('content-type') ?? '').includes('json')) return { ok: false, message: 'You are signed out. Sign in again and your changes will save.' }
  return res.json()
}

interface BrewInfo { id: string; beer_name: string; style: string | null; brew_day: string; tank_id: string; tank_name: string }

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'
const INPUT = 'w-full h-11 rounded-xl border border-gray-200 bg-white px-3 text-base tabular-nums text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary'
// A value read off a photo that nobody has confirmed yet
const UNSURE = 'bg-yeast/40 border-yeast'

// ── Reading and writing "mash.ph" style paths ───────────────────────────────

function getPath(obj: unknown, path: string): string {
  let cur: unknown = obj
  for (const k of path.split('.')) cur = cur == null ? undefined : (cur as Record<string, unknown>)[k]
  return typeof cur === 'string' ? cur : ''
}

function setPath<T>(obj: T, path: string, value: string): T {
  const keys = path.split('.')
  const out = { ...(obj as Record<string, unknown>) }
  let cur = out
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] as Record<string, unknown>) }
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
  return out as T
}

/** Shrink a phone photo so it uploads quickly and stays under the size limits. */
async function shrink(file: File, maxSide = 2200): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That file is not a photo the app can open.'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Section({ title, hint, id, children }: { title: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
  <section id={id} className={`${CARD} p-4 space-y-3 scroll-mt-20`}>
    <div>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
    {children}
  </section>
)
}

export function BrewSheetForm({ brew, initial, initialUnchecked, exists, finished, rtd = false, baseline = null, recipeVersion = null, targetAbv = null, previous = null, me }: {
  brew: BrewInfo
  initial: BrewSheetData
  initialUnchecked: string[]
  exists: boolean
  /** OG is already on the tank: the brew day was finished (or the brew predates the sheet) */
  finished: boolean
  /** A hard lemonade: no mash, no yeast, no gravity or pH, and it goes straight on chill */
  rtd?: boolean
  /** The recipe as a sheet, to see what was changed on the day. Null if the brew has no recipe. */
  baseline?: BrewSheetData | null
  recipeVersion?: number | null
  /** The recipe's target ABV, where the spirit calculator starts on a lemonade */
  targetAbv?: number | null
  /** The last brew of this beer, shown beside each box for comparison */
  previous?: { id: string; brew_day: string; batch_code: string | null; data: BrewSheetData } | null
  me: string
}) {
  const [data, setData] = useState(initial)
  const [unchecked, setUnchecked] = useState<string[]>(initialUnchecked)
  const [status, setStatus] = useState<'idle' | 'unsaved' | 'saving' | 'saved' | 'error'>(exists ? 'saved' : 'idle')
  const [reading, setReading] = useState(false)
  const [found, setFound] = useState<SheetReading[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [done, setDone] = useState(finished)
  const [finishing, setFinishing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [setTemp, setSetTemp] = useState('')
  const [keepChanges, setKeepChanges] = useState(true)
  // Dilution calculator: its own boxes, so trying numbers never touches the record
  const [calcOpen, setCalcOpen] = useState(false)
  const [calc, setCalc] = useState({ volume: '', gravity: '', target: '' })
  // Spirit calculator for lemonades, same idea: its own boxes
  const [spirit, setSpirit] = useState({ volume: '', target: targetAbv != null ? String(targetAbv) : '', strength: '97' })
  const [compare, setCompare] = useState(true)
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)

  // Latest values for the autosave, which runs outside render
  const latest = useRef({ data, unchecked, source: undefined as 'photo' | undefined })
  const dirty = useRef(false)
  const saving = useRef(false)

  const save = useCallback(async () => {
    if (!dirty.current || saving.current) return
    saving.current = true
    // Keep going until nothing changed while a save was in flight
    while (dirty.current) {
      dirty.current = false
      setStatus('saving')
      const snap = latest.current
      let ok = false
      try {
        const res = await postSheet({ brew_id: brew.id, data: snap.data, unchecked: snap.unchecked, source: snap.source })
        ok = res.ok
        if (!res.ok) toast.error(res.message)
      } catch {
        toast.error('Not saved. Check the connection; your entries are still on screen.')
      }
      if (!ok) {
        // Leave it marked unsaved so the next change, or putting the phone down, tries again
        dirty.current = true
        saving.current = false
        setStatus('error')
        return
      }
    }
    saving.current = false
    setStatus('saved')
  }, [brew.id])

  // Coming back to a sheet part way through: go to where the day is up to.
  // That is the first line not yet ticked, or All in FV once every line is.
  useEffect(() => {
    if (finished) return
    const lines = [...document.querySelectorAll<HTMLElement>('li[data-brewday]')]
    if (!lines.some((el) => el.dataset.brewday === 'done')) return // not started: stay at the top
    const next = lines.find((el) => el.dataset.brewday === 'todo')
    const target = next ? next.closest('section') : document.getElementById('all-in-fv')
    // After the first paint, so the page has its full height to scroll within
    const t = setTimeout(() => target?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
    // Once, when the sheet is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save a moment after the last change, and straight away if the app is put down
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touch = useCallback(() => {
    dirty.current = true
    setStatus('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), 1200)
  }, [save])

  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') void save() }
    document.addEventListener('visibilitychange', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      if (timer.current) clearTimeout(timer.current)
      void save()
    }
  }, [save])

  const update = useCallback((next: BrewSheetData, nextUnchecked?: string[]) => {
    latest.current = { ...latest.current, data: next, unchecked: nextUnchecked ?? latest.current.unchecked }
    setData(next)
    if (nextUnchecked) setUnchecked(nextUnchecked)
    touch()
  }, [touch])

  const confirm = (prefix: string) => {
    if (!latest.current.unchecked.some((p) => p === prefix || p.startsWith(prefix + '.'))) return
    const next = latest.current.unchecked.filter((p) => p !== prefix && !p.startsWith(prefix + '.'))
    latest.current.unchecked = next
    setUnchecked(next)
    touch()
  }
  const unsure = (prefix: string) => unchecked.some((p) => p === prefix || p.startsWith(prefix + '.'))

  // ── Photo ────────────────────────────────────────────────────────────────

  async function readPhotos(files: FileList | null) {
    if (!files?.length || reading) return
    if (sheetProgress(data).filled > 0 && !window.confirm('Fill the sheet from this photo? Anything you have already typed is kept; only empty boxes and the ingredient lists are filled.')) return
    setReading(true)
    try {
      const images = await Promise.all([...files].slice(0, 4).map((f) => shrink(f)))
      const res = await fetch('/api/parse-brew-sheet', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images, brew_day: brew.brew_day, beer_name: brew.beer_name }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'The photo could not be read.')

      const got = out.sheet as BrewSheetData
      // Typed entries win. The photo fills blanks, and replaces a list only when
      // it found lines for it.
      const merge = (mine: Record<string, string>, theirs: Record<string, string>) =>
        Object.fromEntries(Object.keys(mine).map((k) => [k, mine[k].trim() ? mine[k] : theirs?.[k] ?? ''])) as Record<string, string>
      const next: BrewSheetData = {
        ...data,
        brewer: data.brewer || got.brewer, cellar: data.cellar || got.cellar, base_malt_batch: data.base_malt_batch || got.base_malt_batch,
        mash: merge(data.mash, got.mash) as BrewSheetData['mash'],
        kettle: merge(data.kettle, got.kettle) as BrewSheetData['kettle'],
        fv: merge(data.fv, got.fv) as BrewSheetData['fv'],
        yeast: merge(data.yeast, got.yeast) as BrewSheetData['yeast'],
        signoffs: merge(data.signoffs, got.signoffs) as BrewSheetData['signoffs'],
        runnings: {
          first: merge(data.runnings.first, got.runnings.first) as BrewSheetData['runnings']['first'],
          mid: merge(data.runnings.mid, got.runnings.mid) as BrewSheetData['runnings']['mid'],
          last: merge(data.runnings.last, got.runnings.last) as BrewSheetData['runnings']['last'],
        },
        notes: data.notes || got.notes,
        malt: got.malt.length ? got.malt : data.malt,
        mash_additions: got.mash_additions.length ? got.mash_additions : data.mash_additions,
        kettle_additions: got.kettle_additions.length ? got.kettle_additions : data.kettle_additions,
        kettle_hops: got.kettle_hops.length ? got.kettle_hops : data.kettle_hops,
        dry_hops: got.dry_hops.length ? got.dry_hops : data.dry_hops,
      }
      const flagged = ((out.uncertain ?? []) as string[]).filter((p) => !p.startsWith('readings.'))
      latest.current.source = 'photo'
      update(next, [...new Set([...latest.current.unchecked, ...flagged])])
      setFound((out.readings ?? []) as SheetReading[])

      const named = String(out.header?.beer_name ?? '').trim()
      if (named && !brew.beer_name.toLowerCase().includes(named.toLowerCase().slice(0, 6)) && !named.toLowerCase().includes(brew.beer_name.toLowerCase().slice(0, 6))) {
        toast.warning(`That sheet says "${named}", but this is ${brew.beer_name}. Check it is the right sheet.`, { duration: 12000 })
      }
      toast.success(flagged.length ? `Sheet read. ${flagged.length} value${flagged.length === 1 ? '' : 's'} highlighted to check.` : 'Sheet read. Have a look over it.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The photo could not be read.')
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function addReadings() {
    if (!found?.length || adding) return
    setAdding(true)
    try {
      const res = await importSheetReadings({ brew_id: brew.id, tank_id: brew.tank_id, readings: found })
      if (!res.ok) { toast.error(res.message); return }
      toast.success(`${res.added} reading${res.added === 1 ? '' : 's'} added to the log${res.skipped ? `, ${res.skipped} already there` : ''}.`)
      setFound(null)
    } catch {
      toast.error('Readings not saved. Try again.')
    } finally {
      setAdding(false)
    }
  }

  // ── Building blocks ──────────────────────────────────────────────────────
  // These are called as plain functions, not used as <Components />. A component
  // defined inside render is a new type on every render, so React would rebuild
  // every input and the keyboard would drop after each keystroke.

  const field = ({ label, path, mode = 'decimal', placeholder, wide }: { label: string; path: string; mode?: 'decimal' | 'text' | 'time'; placeholder?: string; wide?: boolean }) => (
    <label className={`block min-w-0 ${wide ? 'col-span-2' : ''}`}>
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <input
        type={mode === 'time' ? 'time' : 'text'}
        inputMode={mode === 'decimal' ? 'decimal' : undefined}
        autoComplete="off"
        value={getPath(data, path)}
        placeholder={placeholder}
        onChange={(e) => update(setPath(data, path, e.target.value))}
        onBlur={() => confirm(path)}
        className={`${INPUT} ${unsure(path) ? UNSURE : ''}`}
      />
      {compare && previous && getPath(previous.data, path).trim() && (
        <span className="block mt-0.5 text-[11px] text-malt-dark tabular-nums truncate">Last time {getPath(previous.data, path)}</span>
      )}
    </label>
  )

  const setLine = (key: ListKey, i: number, patch: Partial<SheetLine>) => {
    const list = data[key].map((l, j) => (j === i ? { ...l, ...patch } : l))
    update({ ...data, [key]: list })
    confirm(`${key}.${i}`)
  }

  const list = ({ title, listKey, whenLabel, unit, only, newWhen = '' }: {
    title: string; listKey: ListKey; whenLabel: string; unit: string
    /** Show just the lines that pass. Indexes still point into the whole list. */
    only?: (l: SheetLine) => boolean
    newWhen?: string
  }) => {
    const shown = data[listKey].map((l, i) => ({ l, i })).filter(({ l }) => !only || only(l))
    return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {shown.length > 0 && (
          <span className="text-xs text-gray-400 tabular-nums">{shown.filter(({ l }) => l.done).length} of {shown.length} done</span>
        )}
      </div>
      <ul className="space-y-1.5">
        {shown.map(({ l, i }) => (
          <li key={i} data-brewday={listKey !== 'dry_hops' || isDayZero(l) ? (l.done ? 'done' : 'todo') : undefined} className={`rounded-xl border px-2 py-1.5 ${unsure(`${listKey}.${i}`) ? UNSURE : l.done ? 'border-transparent bg-water/25' : 'border-gray-200 bg-white'}`}>
            {/* Name gets the whole row: on a phone, half a name is no name */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setLine(listKey, i, { done: !l.done })} aria-pressed={l.done} aria-label={`${l.name || 'Line'} done`}
                className={`h-9 w-9 flex-shrink-0 rounded-lg border flex items-center justify-center ${l.done ? 'bg-hops border-hops text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                <Check className="h-5 w-5" />
              </button>
              <input value={l.name} onChange={(e) => setLine(listKey, i, { name: e.target.value })} placeholder="Name" aria-label="Name"
                className="flex-1 min-w-0 h-9 bg-transparent text-base font-medium text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none" />
              <button type="button" onClick={() => removeLine(listKey, i)} aria-label={`Remove ${l.name || 'line'}`}
                className="h-9 w-7 flex-shrink-0 flex items-center justify-center text-gray-300 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 pl-11 pr-1 mt-0.5">
              {listKey === 'malt' && bagsLabel(l.amount, l.unit, l.name) && (
                <span className="text-base font-semibold tabular-nums text-gray-900 whitespace-nowrap">{bagsLabel(l.amount, l.unit, l.name)}</span>
              )}
              <input value={l.amount} onChange={(e) => setLine(listKey, i, { amount: e.target.value })} inputMode="decimal" placeholder="0" aria-label="Amount"
                className="w-16 h-9 rounded-lg bg-black/[0.04] px-1.5 text-right text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={l.unit} onChange={(e) => setLine(listKey, i, { unit: e.target.value })} placeholder={unit} aria-label="Unit"
                className="w-10 h-9 bg-transparent text-base text-gray-500 placeholder:text-gray-300 focus:outline-none" />
              {listKey === 'malt' ? <span className="flex-1" /> : (
                <input value={l.when} onChange={(e) => setLine(listKey, i, { when: e.target.value })} placeholder={whenLabel} aria-label={whenLabel}
                  className="flex-1 min-w-0 h-9 bg-transparent text-base text-gray-500 placeholder:text-gray-300 focus:outline-none" />
              )}
              <button type="button" onClick={() => substitute(listKey, i)} className="flex-shrink-0 h-9 px-1 text-xs font-semibold text-primary whitespace-nowrap">
                Substitute
              </button>
            </div>
            {l.note && <p className="pl-11 pr-1 pb-0.5 text-xs text-malt-dark break-words">{l.note}</p>}
          </li>
        ))}
      </ul>
      <button type="button"
        onClick={() => update({ ...data, [listKey]: [...data[listKey], { name: '', amount: '', unit, when: newWhen, done: false, note: '' }] })}
        className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-primary h-9 px-1">
        <Plus className="h-4 w-4" />Add a line
      </button>
    </div>
  )
  }

  // Lemonade: the spirit dose depends on what actually landed in the tank, so it is worked out here each time
  const spiritCalc = () => {
    const volume = spirit.volume || data.fv.volume_l.trim()
    const v = sheetNumber(volume), t = sheetNumber(spirit.target), st = sheetNumber(spirit.strength)
    const result = v != null && t != null && st != null ? spiritDose(v, t, st) : null
    const litres = result ? Math.round(result.spiritL * 10) / 10 : 0
    // Spirit comes in 4 L jugs, so that is how it is measured out
    const jugs = (litres / 4).toFixed(1)
    const fullJugs = Math.floor(litres / 4)
    const partL = Math.round((litres - fullJugs * 4) * 10) / 10
    const lineIndex = data.dry_hops.findIndex((l) => /spirit|ethanol/i.test(l.name))
    const box = (label: string, value: string, key: 'volume' | 'target' | 'strength', placeholder: string) => (
      <label className="block min-w-0">
        <span className="block text-xs text-gray-500 mb-1 whitespace-nowrap">{label}</span>
        <input type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          onChange={(e) => setSpirit({ ...spirit, [key]: e.target.value.replace(/[^0-9.]/g, '') })} className={INPUT} />
      </label>
    )
    return (
      <div className="mt-3 rounded-xl bg-background ring-1 ring-black/5 p-3 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Spirit calculator</h3>
        <div className="grid grid-cols-3 gap-2">
          {box('In tank (L)', volume, 'volume', '0')}
          {box('Target ABV %', spirit.target, 'target', '4.5')}
          {box('Spirit ABV %', spirit.strength, 'strength', '97')}
        </div>
        {result ? (
          <div className="rounded-xl bg-white ring-1 ring-black/5 px-3 py-2.5">
            <p className="text-xs text-gray-500">Add</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-gray-900">{jugs} jugs</p>
            <p className="text-sm font-medium text-gray-900 tabular-nums">
              {fullJugs} full 4 L jug{fullJugs === 1 ? '' : 's'}{partL > 0 ? ` + ${partL} L` : ''} · {litres} L of spirit
            </p>
            <p className="text-sm text-gray-600 tabular-nums">New volume {Math.round(result.finalL).toLocaleString('en-AU')} L at {t}%</p>
            <button type="button"
              onClick={() => {
                const line = { amount: String(litres), unit: 'L', note: `${jugs} jugs (${fullJugs} full 4 L${partL > 0 ? ` + ${partL} L` : ''}). ${v} L in tank to ${t}% with ${st}% spirit. New volume ${Math.round(result.finalL)} L` }
                const list = lineIndex >= 0
                  ? data.dry_hops.map((l, i) => (i === lineIndex ? { ...l, ...line } : l))
                  : [...data.dry_hops, { name: 'Tarac Grape Spirit', when: 'Brite tank', done: false, ...line }]
                update({ ...data, dry_hops: list })
                toast.success(`${jugs} jugs (${litres} L) put on the grape spirit line.`)
              }}
              className="mt-2 h-10 px-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
              Put {jugs} jugs on the grape spirit line
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Enter the volume in tank and the target ABV, and it works out the spirit to add and the new volume.</p>
        )}
      </div>
    )
  }

  // How much water takes the wort from what is in the tank down to the gravity wanted
  const dilutionCalc = () => {
    // Start from All in FV, falling back to the post boil figures
    const startVolume = data.fv.volume_l.trim() || data.kettle.post_boil_volume_l.trim()
    const startGravity = data.fv.plato.trim() || data.kettle.post_boil_plato.trim()
    const volume = calc.volume || startVolume
    const gravity = calc.gravity || startGravity
    const v = sheetNumber(volume), g = sheetNumber(gravity), t = sheetNumber(calc.target)
    const result = v != null && g != null && t != null ? dilution(v, g, t) : null
    const tooHigh = g != null && t != null && t >= g
    const box = (label: string, value: string, key: 'volume' | 'gravity' | 'target', placeholder: string) => (
      <label className="block min-w-0">
        <span className="block text-xs text-gray-500 mb-1 whitespace-nowrap">{label}</span>
        <input type="text" inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          onChange={(e) => setCalc({ ...calc, [key]: e.target.value.replace(/[^0-9.]/g, '') })} className={INPUT} />
      </label>
    )
    if (!calcOpen) {
      return (
        <button type="button" onClick={() => setCalcOpen(true)} className="mt-3 inline-flex items-center gap-1.5 h-10 px-1 text-sm font-semibold text-primary">
          <Plus className="h-4 w-4" />Dilution calculator
        </button>
      )
    }
    return (
      <div className="mt-3 rounded-xl bg-background ring-1 ring-black/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Dilution calculator</h3>
          <button type="button" onClick={() => setCalcOpen(false)} aria-label="Close the dilution calculator" className="h-8 w-8 -mr-1 flex items-center justify-center text-gray-400"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {box('Volume (L)', volume, 'volume', '0')}
          {box('Now °P', gravity, 'gravity', '0')}
          {box('Target °P', calc.target, 'target', '10.4')}
        </div>
        {result ? (
          <div className="rounded-xl bg-white ring-1 ring-black/5 px-3 py-2.5">
            <p className="text-xs text-gray-500">Add</p>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-gray-900">{Math.round(result.waterL)} L of cold liquor</p>
            <p className="text-sm text-gray-600 tabular-nums">for {Math.round(result.finalL).toLocaleString('en-AU')} L at {t}°P</p>
            <button type="button"
              onClick={() => { update(setPath(data, 'kettle.dilution_l', String(Math.round(result.waterL)))); toast.success(`${Math.round(result.waterL)} L put in the Dilution box. Measure volume and gravity again after adding it.`) }}
              className="mt-2 h-10 px-3 rounded-xl bg-primary/10 text-primary text-sm font-semibold">
              Put {Math.round(result.waterL)} L in the Dilution box
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {tooHigh ? 'The gravity wanted has to be lower than the gravity now. Cold liquor only brings it down.' : 'Enter the gravity you want and it works out the cold liquor to add.'}
          </p>
        )}
        <p className="text-[11px] text-gray-400">This is a working-out tool. Nothing here is saved unless you tap the button, and All in FV still needs the measured numbers.</p>
      </div>
    )
  }

  // Something else went in instead: the line takes the new name and keeps a note of what it replaced
  function substitute(listKey: ListKey, index: number) {
    const line = data[listKey][index]
    if (!line) return
    const used = window.prompt(`What was used in place of ${line.name || 'this'}?`)?.trim()
    if (!used || used === line.name) return
    // Keep the first original if it is substituted twice
    const original = /^Substituted for /.test(line.note) ? line.note : line.name ? `Substituted for ${line.name}` : ''
    setLine(listKey, index, { name: used, note: original })
  }

  // The one deliberate step of the day: the All in FV figures go onto the tank
  // Step one: check the numbers are there, then ask what the tank should be set to
  function askToFinish() {
    const { volume_l, plato, ph, temp_c } = latest.current.data.fv
    const missing = (rtd
      ? [!volume_l.trim() && 'volume', !temp_c.trim() && 'temperature']
      : [!volume_l.trim() && 'volume', !plato.trim() && 'gravity', !ph.trim() && 'pH']).filter(Boolean)
    if (missing.length) { toast.error(`Enter ${missing.join(', ')} first.`); return }
    // A lemonade goes straight on chill, so that is the temperature to offer
    setSetTemp(latest.current.data.yeast.set_temp_c.trim() || (rtd ? '-0.5' : ''))
    setConfirming(true)
  }

  // Step two, the one deliberate act of the day: the All in FV figures go onto
  // the tank, the tank gets its set point, and it is back to the cellar.
  async function finishDay() {
    const temp = Number(setTemp)
    if (!setTemp.trim() || !Number.isFinite(temp)) { toast.error(`Enter the temperature to set ${brew.tank_name} to.`); return }
    setFinishing(true)
    try {
      const snap = latest.current
      // The set temperature is part of the record, and so is who set it
      const sheet: BrewSheetData = {
        ...snap.data,
        yeast: { ...snap.data.yeast, set_temp_c: setTemp.trim() },
        signoffs: { ...snap.data.signoffs, frigid_set: snap.data.signoffs.frigid_set || me || 'Yes' },
      }
      const res = await postSheet({ brew_id: brew.id, data: sheet, unchecked: snap.unchecked, source: snap.source, finish: true })
      if (!res.ok) { toast.error(res.message); return }
      update(sheet)
      setDone(true)
      setStatus('saved')

      const set = await setTankTarget(brew.tank_id, temp).catch(() => ({ success: false, message: 'Frigid could not be reached.' }))
      if (set.success) toast.success(`Brew day finished. ${brew.beer_name} is in ${brew.tank_name}${rtd ? ' on chill' : ''}, set to ${temp}°C.`)
      else toast.warning(`Brew day finished, but ${brew.tank_name} was not set to ${temp}°C: ${set.message} Set it from the tank card or at the panel.`, { duration: 15000 })
      // What was changed on the day becomes the recipe, unless the brewer said it was a one-off
      if (baseline && keepChanges && recipeChanges(baseline, sheet).length > 0) {
        const saved = await applySheetToRecipe(brew.id).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
        if (saved.ok) toast.success(`Recipe updated to v${saved.version} for next time.`)
        else toast.warning(`The recipe was not updated: ${saved.message}`, { duration: 12000 })
      }
      setConfirming(false)
      router.push('/')
    } catch {
      toast.error('Not finished. Check the connection and tap it again.')
    } finally {
      setFinishing(false)
    }
  }

  async function cancelDay() {
    if (!window.confirm(`Cancel the brew day for ${brew.beer_name} in ${brew.tank_name}?\n\nThe brew and everything on this sheet will be deleted and the tank goes back to empty. This cannot be undone.`)) return
    setFinishing(true)
    // Stop a last autosave from writing the sheet back after the brew is gone
    dirty.current = false
    if (timer.current) clearTimeout(timer.current)
    const res = await cancelBrewDay(brew.id).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
    if (!res.ok) { setFinishing(false); toast.error(res.message); return }
    toast.success(`Brew day cancelled. ${brew.tank_name} is empty again.`)
    router.push('/')
  }

  // Removing a line asks first, and can be undone for a few seconds after
  function removeLine(listKey: ListKey, index: number) {
    const line = data[listKey][index]
    if (!line) return
    const label = [line.name || 'this line', [line.amount, line.unit].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    if (!window.confirm(`Remove ${label} from this brew sheet?`)) return
    update({ ...data, [listKey]: data[listKey].filter((_, j) => j !== index) })
    toast(`Removed ${line.name || 'the line'}`, {
      duration: 10000,
      action: {
        label: 'Undo',
        onClick: () => {
          // Put it back into the sheet as it is now, not as it was when removed
          const now = latest.current.data
          const list = [...now[listKey]]
          list.splice(Math.min(index, list.length), 0, line)
          update({ ...now, [listKey]: list })
        },
      },
    })
  }

  const progress = sheetProgress(data, rtd)
  // What differs from the recipe, worked out only while the finish box is up
  const changes = confirming && baseline ? recipeChanges(baseline, data) : []
  const statusText = { idle: 'Nothing entered yet', unsaved: 'Saving…', saving: 'Saving…', saved: 'All saved', error: 'Not saved - will retry on your next change' }[status]

  return (
    <div className="space-y-3 pb-10">
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={() => !finishing && setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-label="Finish brew day" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900">Finish brew day</h2>
            <p className="text-sm text-gray-500">{brew.beer_name} in {brew.tank_name}</p>
            <dl className={`grid gap-2 mt-4 ${rtd ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {((rtd
                ? [['Volume', `${data.fv.volume_l} L`], ['Temp', `${data.fv.temp_c}°C`]]
                : [['Volume', `${data.fv.volume_l} L`], ['Gravity', `${data.fv.plato}°P`], ['pH', data.fv.ph]]) as [string, string][]).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-background px-3 py-2">
                  <dt className="text-[11px] text-gray-400">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <label className="block mt-4">
              <span className="block text-sm font-medium text-gray-900 mb-1">Set {brew.tank_name} to (°C)</span>
              <input type="text" inputMode="decimal" value={setTemp} onChange={(e) => setSetTemp(e.target.value.replace(/[^0-9.\-]/g, ''))} placeholder="e.g. 19"
                className="w-full h-14 rounded-xl border border-gray-200 bg-white px-3 text-center text-xl font-semibold tabular-nums text-gray-900 placeholder:text-gray-300 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <span className="block text-xs text-gray-400 mt-1">{rtd ? 'It goes straight on chill. ' : ''}This is sent to Frigid when you finish.</span>
            </label>
            {changes.length > 0 && (
              <div className="mt-4 rounded-xl bg-background px-3 py-2.5">
                <p className="text-sm font-medium text-gray-900">{changes.length} change{changes.length === 1 ? '' : 's'} from the recipe</p>
                <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-gray-600 space-y-0.5">
                  {changes.map((c) => <li key={c} className="break-words">• {c}</li>)}
                </ul>
                <label className="mt-2.5 flex items-start gap-2.5">
                  <input type="checkbox" checked={keepChanges} onChange={(e) => setKeepChanges(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--color-hops)]" />
                  <span className="text-sm text-gray-900">
                    Make this the recipe for next time{recipeVersion != null ? ` (v${recipeVersion + 1})` : ''}
                    <span className="block text-xs text-gray-500">Untick if it was a one-off, like a substitute for something out of stock.</span>
                  </span>
                </label>
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button type="button" onClick={() => setConfirming(false)} disabled={finishing} className="flex-1 h-12 rounded-xl ring-1 ring-black/10 text-sm font-medium text-gray-700">Back</button>
              <button type="button" onClick={() => void finishDay()} disabled={finishing}
                className="flex-1 h-12 rounded-xl bg-malt text-white text-base font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Finish
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <header className={`${CARD} p-4`}>
        <p className="text-[11px] font-semibold tracking-wide text-gray-400">
          BREW SHEET · {brew.tank_name} · {new Date(brew.brew_day + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 leading-tight">{brew.beer_name}</h1>
        {brew.style && <p className="text-sm text-gray-500">{brew.style}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void readPhotos(e.target.files)} />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={reading}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-primary/10 text-primary text-sm font-semibold disabled:opacity-60">
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {reading ? 'Reading the sheet…' : 'Fill from a photo'}
          </button>
          <span className={`text-xs ${status === 'error' ? 'text-red-600' : 'text-gray-400'}`} aria-live="polite">
            {statusText}{progress.total > 0 && status !== 'error' ? ` · ${progress.filled} of ${progress.total} filled` : ''}
          </span>
        </div>
        {reading && <p className="text-xs text-gray-400 mt-2">This takes up to a minute. Keep this page open.</p>}
        {previous && (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-malt/10 px-3 py-2">
            <p className="flex-1 min-w-0 text-xs text-charcoal">
              {compare ? 'Showing last time under each box: ' : 'Last brewed '}
              <Link href={`/brews/${previous.id}/sheet`} className="font-semibold underline decoration-dotted underline-offset-2">
                {new Date(previous.brew_day + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}{previous.batch_code ? `, batch ${previous.batch_code}` : ''}
              </Link>
            </p>
            <button type="button" onClick={() => setCompare((c) => !c)} className="flex-shrink-0 text-xs font-semibold text-primary">{compare ? 'Hide' : 'Compare'}</button>
          </div>
        )}
        {!done && (
          <p className="mt-3 rounded-xl bg-yeast/40 px-3 py-2 text-xs text-charcoal">
            Brew day in progress. It saves as you type, so close this and come back any time. Nothing reaches the tank card until you tap Finish brew day.
          </p>
        )}
      </header>

      {unchecked.length > 0 && (
        <div className="rounded-2xl bg-yeast/40 ring-1 ring-yeast px-4 py-3 flex items-center gap-3">
          <p className="flex-1 text-sm text-charcoal">
            <strong className="font-semibold">{unchecked.length} value{unchecked.length === 1 ? '' : 's'} to check.</strong>{' '}
            The highlighted boxes were hard to read off the photo. Tap into each one, fix it if it is wrong, and it clears.
          </p>
          <button type="button" onClick={() => update(data, [])} className="flex-shrink-0 h-10 px-3 rounded-xl bg-white text-sm font-semibold text-charcoal ring-1 ring-black/10">
            All correct
          </button>
        </div>
      )}

      {found && found.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h2 className="text-base font-semibold text-gray-900">Ferment log on the photo</h2>
          <p className="text-xs text-gray-400 mt-0.5">{found.length} rows read. Check them against the sheet, then add them to this beer&apos;s readings. Rows already logged are skipped.</p>
          <ul className="mt-2 divide-y divide-gray-100 text-sm max-h-64 overflow-y-auto">
            {found.map((r, i) => (
              <li key={i} className="flex items-baseline gap-3 py-1.5">
                <span className="w-24 flex-shrink-0 tabular-nums text-gray-500">{r.date.slice(8)}/{r.date.slice(5, 7)}{r.time ? ` ${r.time}` : ''}</span>
                <span className="flex-1 min-w-0 tabular-nums text-gray-900">
                  {[r.plato != null ? `${r.plato}°P` : '', r.ph != null ? `pH ${r.ph}` : '', r.temp_c != null ? `${r.temp_c}°C` : ''].filter(Boolean).join(' · ')}
                  {r.note && <span className="text-gray-500">{r.plato != null || r.ph != null ? ' · ' : ''}{r.note}</span>}
                </span>
                <button type="button" onClick={() => setFound(found.filter((_, j) => j !== i))} aria-label="Leave this row out" className="text-gray-300 hover:text-red-500"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={addReadings} disabled={adding}
              className="flex-1 h-11 rounded-xl bg-primary text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}Add {found.length} to the log
            </button>
            <button type="button" onClick={() => setFound(null)} className="h-11 px-4 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Skip</button>
          </div>
        </section>
      )}

      <Section title="Who">
        <div className="grid grid-cols-2 gap-3">
          {field({ label: "Brewer", path: "brewer", mode: "text" })}
          {field({ label: "Cellar", path: "cellar", mode: "text" })}
        </div>
      </Section>

      {!rtd && <>
      <Section title="Malt">
        {list({ title: "Grain bill", listKey: "malt", whenLabel: "Bags", unit: "kg" })}
        {field({ label: "Base malt batch no.", path: "base_malt_batch", mode: "text" })}
      </Section>

      <Section title="Mash">
        <div className="grid grid-cols-2 gap-3">
          {field({ label: "Mash in", path: "mash.time", mode: "time" })}
          {field({ label: "Target temp °C", path: "mash.target_temp_c" })}
          {field({ label: "Actual temp °C", path: "mash.actual_temp_c" })}
          {field({ label: "pH", path: "mash.ph" })}
          {field({ label: "Acid added", path: "mash.acid", mode: "text", placeholder: "e.g. 100 mL LA", wide: true })}
        </div>
        {list({ title: "Mash additions", listKey: "mash_additions", whenLabel: "Note", unit: "g" })}
      </Section>

      <Section title="Runnings">
        {(['first', 'mid', 'last'] as const).map((k) => (
          <div key={k}>
            <p className="text-sm font-semibold text-gray-900 capitalize mb-1">{k}</p>
            <div className="grid grid-cols-3 gap-2">
              {field({ label: "Time", path: `runnings.${k}.time`, mode: "time" })}
              {field({ label: "°P", path: `runnings.${k}.plato` })}
              {field({ label: "pH", path: `runnings.${k}.ph` })}
            </div>
          </div>
        ))}
      </Section>
      </>}

      <Section title="Kettle">
        <div className="grid grid-cols-2 gap-3">
          {field({ label: "All in kettle (L)", path: "kettle.volume_l" })}
          {field({ label: "Start of boil", path: "kettle.boil_start", mode: "time" })}
          {field({ label: "Boil (minutes)", path: "kettle.boil_minutes" })}
          {field({ label: "Post boil (L)", path: "kettle.post_boil_volume_l" })}
          {!rtd && field({ label: "Post boil °P", path: "kettle.post_boil_plato" })}
          {!rtd && field({ label: "Post boil pH", path: "kettle.post_boil_ph" })}
          {field({ label: "Dilution (L)", path: "kettle.dilution_l" })}
        </div>
        {list({ title: rtd ? "Ingredients" : "Kettle additions", listKey: "kettle_additions", whenLabel: rtd ? "Note" : "Time", unit: "g" })}
        {!rtd && list({ title: "Kettle hops", listKey: "kettle_hops", whenLabel: "Time", unit: "kg" })}
      </Section>

      {!rtd && <>
      <Section title="Yeast">
        <div className="grid grid-cols-2 gap-3">
          {field({ label: "Strain", path: "yeast.strain", mode: "text", wide: true })}
          {field({ label: "Amount", path: "yeast.amount", mode: "text", placeholder: "e.g. 1 kg" })}
          {field({ label: "Lot no.", path: "yeast.lot", mode: "text" })}
          {field({ label: "Best before", path: "yeast.best_before", mode: "text", placeholder: "e.g. 03/2028" })}
          {field({ label: "Pitch temp °C", path: "yeast.pitch_temp_c" })}
          {field({ label: "Set temp °C", path: "yeast.set_temp_c" })}
        </div>
      </Section>

      <Section title="Day 0 additions" hint="These go in today, before the brew day is finished.">
        {list({ title: "Additions", listKey: "dry_hops", whenLabel: "Day / °P", unit: "g", only: isDayZero, newWhen: "Day 0" })}
      </Section>
      </>}

      <Section id="all-in-fv" title={rtd ? "All in tank" : "All in FV"} hint={rtd ? "Knock out to the tank, enter the volume, then dose the spirit from the calculator. No gravity or pH for a lemonade." : "Volume and gravity here set the tank card's volume and OG."}>
        <div className="grid grid-cols-2 gap-3">
          {field({ label: "Volume (L)", path: "fv.volume_l" })}
          {!rtd && field({ label: "Gravity °P", path: "fv.plato" })}
          {!rtd && field({ label: "pH", path: "fv.ph" })}
          {field({ label: "Temp °C", path: "fv.temp_c" })}
        </div>
        {!rtd && dilutionCalc()}
        {rtd && spiritCalc()}
        {rtd && (
          <div className="mt-3">
            {list({ title: "Spirit and tank additions", listKey: "dry_hops", whenLabel: "Note", unit: "g" })}
          </div>
        )}
        {done ? (
          <p className="mt-3 rounded-xl bg-water/30 px-3 py-2 text-xs text-hops">
            {rtd ? 'Finished and on chill. To correct the volume, change it here and the tank card follows.' : 'Brew day finished. To correct volume, gravity or pH, change it here: the tank card and the first reading follow.'}
          </p>
        ) : (
          <>
            <button type="button" onClick={askToFinish} disabled={finishing}
              className="mt-3 w-full h-12 rounded-xl bg-malt text-white text-base font-semibold inline-flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-60">
              {finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}Finish brew day
            </button>
            <p className="mt-1.5 text-xs text-gray-400">{rtd ? 'Check the volume and temperature first. This sets the tank card and puts it straight on chill.' : 'Check the three numbers first. This sets the tank card and starts the ferment chart.'}</p>
          </>
        )}
      </Section>

      {!rtd && (
        <Section title="After brew day: dry hop and cellar additions" hint="These go in over the following days. They are not needed to finish the brew day.">
          {list({ title: "Additions", listKey: "dry_hops", whenLabel: "Day / °P", unit: "kg", only: (l) => !isDayZero(l) })}
        </Section>
      )}

      <Section title="Notes">
        <textarea
          value={data.notes}
          onChange={(e) => update({ ...data, notes: e.target.value })}
          rows={4}
          placeholder="Anything worth remembering about this brew"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </Section>

      {/* A way out of a brew day started by mistake or as a test. Gone once the day is finished. */}
      {!done && (
        <div className="pt-2 text-center">
          <button type="button" onClick={() => void cancelDay()} disabled={finishing}
            className="h-11 px-4 rounded-xl text-sm font-semibold text-red-600 ring-1 ring-red-200 bg-white disabled:opacity-60">
            Cancel this brew day
          </button>
          <p className="mt-1.5 text-xs text-gray-400">Removes the brew and this sheet and frees {brew.tank_name}. The tank&apos;s set point is not touched.</p>
        </div>
      )}
    </div>
  )
}
