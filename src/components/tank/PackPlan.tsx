'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Check, Loader2, Send, X, AlertTriangle } from 'lucide-react'
import { setPackCheck, sendVolumeToSplits } from '@/app/brews/pack-plan-actions'
import { formatUserName } from '@/lib/utils'
import { PACK_CHECKS } from '@/types'
import type { Brew, PackCheckKey, PackChecks } from '@/types'
import type { SheetSplit, SplitFit } from '@/lib/tank-splits'

const litres = (n: number) => `${Math.round(n).toLocaleString('en-AU')} L`

/** "About 60 L short" or "About 120 L spare". Null when the splits fit. */
export function fitLabel(fit: SplitFit | null | undefined): string | null {
  if (!fit || fit.kind === 'ok') return null
  return fit.kind === 'short' ? `About ${litres(fit.litres)} short for the splits` : `About ${litres(fit.litres)} spare after the splits`
}

/** The materials that matter for this split: no collars for a cans-only run. */
export function checksFor(split: SheetSplit | null | undefined) {
  if (!split) return PACK_CHECKS
  const cans = split.qty.c24 + split.qty.c16 > 0
  const kegs = split.qty.keg50 + split.qty.keg30 + split.qty.keg20 > 0
  return PACK_CHECKS.filter((c) => (c.needs === 'cans' ? cans : kegs))
}

/**
 * Which ticks belong on the tank card right now. Cans and labels matter once
 * the beer is nearly done fermenting; clips and collars only once it is in a
 * brite. The plan dialog always lists all of them.
 */
export function checksDue(brew: Brew, split: SheetSplit | null | undefined, tankName: string, plato: number | null | undefined) {
  const inBrite = split?.fit?.basis === 'brite' || /bbt|brite/i.test(tankName)
  const recipe = Array.isArray(brew.recipes) ? brew.recipes[0] : brew.recipes
  const fg = recipe?.target_fg_plato != null ? Number(recipe.target_fg_plato) : null
  // Within 1°P of where it should finish. With no recipe to say where that is,
  // leaving active ferment is the nearest thing to "nearly done".
  const nearlyDone = fg != null ? plato != null && plato <= fg + 1 : brew.stage !== 'active_ferment'
  return checksFor(split).filter((c) => (c.key === 'clips' || c.key === 'collars' ? inBrite : inBrite || nearlyDone))
}

/** One hook for ticking materials, shared by the card chips and the dialog so they never disagree. */
function usePackChecks(brew: Brew) {
  const [checks, setChecks] = useState<PackChecks>(brew.pack_checks ?? {})
  const [seen, setSeen] = useState(brew.pack_checks)
  // Someone else ticked one: take theirs when the card reloads
  if (seen !== brew.pack_checks) { setSeen(brew.pack_checks); setChecks(brew.pack_checks ?? {}) }
  const [, startTransition] = useTransition()

  function toggle(key: PackCheckKey) {
    const done = !checks[key]
    const before = checks
    setChecks((c) => { const n = { ...c }; if (done) n[key] = { by: 'you', at: new Date().toISOString() }; else delete n[key]; return n })
    startTransition(async () => {
      const res = await setPackCheck(brew.id, key, done).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
      if (!res.ok) { setChecks(before); toast.error(res.message); return }
      if (res.checks) setChecks(res.checks)
      toast.success(`${res.message} for ${brew.beer_name}`)
    })
  }
  return { checks, toggle }
}

/** Small ticks on a tank card: which materials are sorted. Tap one to change it. */
export function PackChips({ brew, split, tankName, plato, onOpen }: {
  brew: Brew
  split: SheetSplit | null | undefined
  tankName: string
  /** Latest gravity reading */
  plato: number | null | undefined
  /** Given, the chips collapse to one count that opens the plan: for cards too narrow for a row of them */
  onOpen?: () => void
}) {
  const { checks, toggle } = usePackChecks(brew)
  const items = checksDue(brew, split, tankName, plato)
  // Nothing due yet, or nothing planned and nothing ticked: the card stays clean
  if (items.length === 0 || (!split && Object.keys(checks).length === 0)) return null
  if (onOpen) {
    const done = items.filter((c) => checks[c.key]).length
    const all = done === items.length
    return (
      <button type="button" onClick={onOpen} title={items.map((c) => `${c.label}: ${checks[c.key] ? 'done' : 'not yet'}`).join('\n')}
        className={`self-start inline-flex items-center gap-1 h-6 pl-1 pr-2 rounded-full border text-[11px] font-medium whitespace-nowrap ${all ? 'bg-water/40 border-water text-hops' : 'bg-white border-gray-200 text-gray-500'}`}>
        <Check className={`h-3 w-3 ${all ? '' : 'opacity-40'}`} />Materials {done}/{items.length}
      </button>
    )
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((c) => {
        const done = !!checks[c.key]
        return (
          <button key={c.key} type="button" onClick={() => toggle(c.key)} aria-pressed={done} title={done ? c.done : `${c.label} not done yet`}
            className={`inline-flex items-center gap-0.5 h-6 pl-1 pr-1.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${done ? 'bg-water/40 border-water text-hops' : 'bg-white border-gray-200 text-gray-400'}`}>
            <Check className={`h-3 w-3 ${done ? '' : 'opacity-25'}`} />{c.label}
          </button>
        )
      })}
    </div>
  )
}

/** Each format the Splits sheet plans, as [label, count, litres each] */
function splitRows(split: SheetSplit): [string, number, number][] {
  return ([
    ['24 × 375 mL cartons', split.qty.c24, 9], ['16 × 440 mL cartons', split.qty.c16, 7.04],
    ['50 L kegs', split.qty.keg50, 50], ['30 L kegs', split.qty.keg30, 30], ['20 L kegs', split.qty.keg20, 20],
  ] as [string, number, number][]).filter(([, n]) => n > 0)
}

const packDayLabel = (split: SheetSplit) =>
  new Date(split.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

function SplitTable({ split }: { split: SheetSplit }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <tbody>
        {splitRows(split).map(([label, n, each]) => (
          <tr key={label} className="border-t border-gray-100 first:border-t-0">
            <td className="py-1.5 text-gray-700">{label}</td>
            <td className="py-1.5 text-right font-semibold text-gray-900">{n}</td>
            <td className="py-1.5 pl-3 text-right text-gray-500 w-20">{litres(n * each)}</td>
          </tr>
        ))}
        <tr className="border-t border-gray-200">
          <td className="pt-2 font-semibold text-gray-900" colSpan={2}>Splits add up to</td>
          <td className="pt-2 pl-3 text-right font-bold text-gray-900">{litres(split.plannedL)}</td>
        </tr>
      </tbody>
    </table>
  )
}

/** Whether the splits fit the beer in the tank. `brief` drops the explanation. */
function FitNote({ fit, brief = false }: { fit: SplitFit; brief?: boolean }) {
  return (
    <div className={`rounded-xl ${brief ? 'px-3 py-2' : 'p-3'} ${fit.kind === 'ok' ? 'bg-water/25' : 'bg-malt/15 ring-1 ring-malt/40'}`}>
      <p className={`flex items-center gap-1.5 text-sm font-semibold ${fit.kind === 'ok' ? 'text-hops' : 'text-malt-dark'}`}>
        {fit.kind === 'ok' ? <Check className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
        {fit.kind === 'ok' ? 'The splits fit the beer in the tank' : fit.kind === 'short' ? `About ${litres(fit.litres)} short` : `About ${litres(fit.litres)} left over`}
      </p>
      {!brief && (
        <p className="mt-1 text-xs text-gray-600 tabular-nums">
          Expect about {litres(fit.packable)} to pack: {fit.yieldPct}% of what is in the tank.{' '}
          {fit.basis === 'brite'
            ? 'It has been transferred, so nearly all of it packs.'
            : 'It is still in the fermenter, so that is an estimate from past batches of this beer.'}
          {fit.kind === 'short' && ' Trim the splits on the sheet or expect to come up short on the last format.'}
          {fit.kind === 'spare' && ` That is roughly ${Math.floor(fit.litres / 50)} more 50 L keg${Math.floor(fit.litres / 50) === 1 ? '' : 's'} or ${Math.floor(fit.litres / 9)} more 24 packs.`}
        </p>
      )}
    </div>
  )
}

/**
 * The plan at the top of an opened brite tank: pack day, formats, whether it
 * fits and the materials ticks, with the full plan a tap away.
 */
export function PackPlanSummary({ brew, tank, split, plato, abvNow }: {
  brew: Brew
  tank: string
  split: SheetSplit | null | undefined
  plato: number | null | undefined
  abvNow: number | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl bg-background ring-1 ring-black/5 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {split ? <>Pack {packDayLabel(split)}{split.proposed ? ' (proposed)' : ''}</> : 'Packaging plan'}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-primary whitespace-nowrap">Full plan</button>
      </div>
      {split ? (
        <>
          {split.label && <p className="text-sm font-medium text-gray-900 break-words">{split.label}</p>}
          <SplitTable split={split} />
          {split.fit && <FitNote fit={split.fit} brief />}
        </>
      ) : (
        <p className="text-sm text-gray-500">No row on the Splits sheet for this beer yet.</p>
      )}
      <PackChips brew={brew} split={split} tankName={tank} plato={plato} />
      {open && <PackPlanDialog brew={brew} tank={tank} split={split} abvNow={abvNow} targetAbv={brew.target_abv} onClose={() => setOpen(false)} />}
    </section>
  )
}

/**
 * The packaging plan for a beer in tank: what the Splits sheet says it is
 * being packed into, whether there is enough beer for that, and which
 * materials are sorted. The sheet is where splits are edited; this reads it.
 */
export function PackPlanDialog({ brew, tank, split, abvNow, targetAbv, onClose }: {
  brew: Brew
  tank: string
  split: SheetSplit | null | undefined
  /** From the first and latest gravity readings. Null before fermentation starts. */
  abvNow: number | null
  targetAbv?: number | null
  onClose: () => void
}) {
  const { checks, toggle } = usePackChecks(brew)
  const [sending, setSending] = useState(false)
  const fit = split?.fit ?? null
  const packDay = split ? packDayLabel(split) : null

  async function send() {
    setSending(true)
    const res = await sendVolumeToSplits(brew.id).catch(() => ({ ok: false as const, message: 'Could not reach the app.' }))
    setSending(false)
    if (res.ok) toast.success(res.message); else toast.error(res.message)
  }

  const CARD = 'rounded-xl bg-background ring-1 ring-black/5 p-3'
  const H = 'text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Packaging plan for ${brew.beer_name}`}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-8 sm:pb-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-gray-400">{tank}{brew.batch_code ? ` · ${brew.batch_code}` : ''}</p>
            <h2 className="text-lg font-semibold text-gray-900 break-words">{brew.beer_name}</h2>
            <p className="text-sm text-gray-500">Packaging plan</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-9 w-9 flex-shrink-0 flex items-center justify-center text-gray-400"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className={CARD}>
            <p className="text-xs text-gray-500">In tank now</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{litres(Number(brew.volume_l))}</p>
          </div>
          <div className={CARD}>
            <p className="text-xs text-gray-500">ABV now</p>
            <p className="text-xl font-bold tabular-nums text-gray-900">{abvNow != null ? `${abvNow.toFixed(1)}%` : '-'}</p>
            <p className="text-[11px] text-gray-400 tabular-nums">{targetAbv != null ? `Target ${Number(targetAbv).toFixed(1)}%` : abvNow == null ? 'No gravity readings yet' : 'From the gravity readings'}</p>
          </div>
        </div>

        {split ? (
          <>
            <div>
              <p className={H}>From the Splits sheet · pack {packDay}{split.proposed ? ' (proposed)' : ''}</p>
              <div className={CARD}>
                <p className="text-sm font-medium text-gray-900 break-words">{split.label}</p>
                <div className="mt-2"><SplitTable split={split} /></div>
              </div>
            </div>

            {fit && <FitNote fit={fit} />}

            <div>
              <button type="button" onClick={send} disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-black/[0.04] text-sm font-semibold text-gray-900 disabled:opacity-50 active:bg-black/10">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send {litres(Number(brew.volume_l))} to the Splits sheet
              </button>
              <p className="mt-1 text-xs text-gray-400">Fills the FV VOL cell on this beer&apos;s row. It also happens by itself whenever the tank volume changes.</p>
            </div>
          </>
        ) : (
          <div className={CARD}>
            <p className="text-sm font-medium text-gray-900">No row on the Splits sheet for this beer yet</p>
            <p className="mt-0.5 text-xs text-gray-500">Add it to the Packaging Splits sheet and it will show here within ten minutes.</p>
          </div>
        )}

        <div>
          <p className={H}>Materials</p>
          <ul className="space-y-2">
            {checksFor(split).map((c) => {
              const hit = checks[c.key]
              return (
                <li key={c.key}>
                  <button type="button" onClick={() => toggle(c.key)} aria-pressed={!!hit}
                    className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${hit ? 'bg-water/25 border-transparent' : 'bg-white border-gray-200 active:bg-gray-50'}`}>
                    <span className={`h-8 w-8 flex-shrink-0 rounded-lg border flex items-center justify-center ${hit ? 'bg-hops border-hops text-white' : 'bg-white border-gray-300 text-transparent'}`}>
                      <Check className="h-5 w-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900">{c.done}</span>
                      <span className="block text-xs text-gray-500">
                        {hit ? `${hit.by === 'you' ? 'You' : formatUserName(hit.by)}, ${new Date(hit.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : 'Not yet'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-xs text-gray-400">Everyone sees these ticks on the tank card.</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
