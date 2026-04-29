'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Trash2 } from 'lucide-react'
import { createScheduledBrew, updateScheduledBrew, deleteScheduledBrew } from '@/app/schedule/actions'
import { DEFAULT_SETTINGS } from '@/types'
import type { ScheduledBrew, ScheduledBrewStatus, ScheduledBrewEventType, ScheduledBrewType, AppSettings } from '@/types'

export interface RecipeOption { id: string; name: string; style: string | null }
export interface TankOption   { id: string; name: string }
export interface ModalState   { mode: 'create' | 'edit'; brew?: ScheduledBrew; date?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function transferDate(packDate: string) {
  const d = new Date(packDate + 'T00:00:00')
  d.setDate(d.getDate() - 3)
  const dow = d.getDay()
  if (dow === 6) d.setDate(d.getDate() - 1)
  else if (dow === 0) d.setDate(d.getDate() - 2)
  return d.toISOString().slice(0, 10)
}
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ── Style maps ────────────────────────────────────────────────────────────────

const EVENT_PILL: Record<ScheduledBrewEventType, string> = {
  brew:     'bg-red-50 text-red-800 border-red-200',
  pack:     'bg-blue-50 text-blue-800 border-blue-200',
  transfer: 'bg-purple-50 text-purple-800 border-purple-200',
}
const EVENT_LABEL: Record<ScheduledBrewEventType, string> = {
  brew: 'Brew', pack: 'Pack', transfer: 'Transfer',
}
const STATUS_LABELS: Record<ScheduledBrewStatus, string> = {
  planned: 'Planned', confirmed: 'Confirmed', brewing: 'Brewing', done: 'Done', cancelled: 'Cancelled',
}
const STATUS_PILL: Record<ScheduledBrewStatus, string> = {
  planned:   'bg-gray-100 text-gray-600 border-gray-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  brewing:   'bg-amber-50 text-amber-700 border-amber-200',
  done:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-400 border-red-200',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  state: ModalState
  recipes: RecipeOption[]
  tanks: TankOption[]
  settings?: AppSettings
  /** Pre-select and lock a specific tank (e.g. when opened from a tank card) */
  initialTankId?: string
  onClose: () => void
}

export function BrewModal({ state, recipes, tanks, settings = DEFAULT_SETTINGS, initialTankId, onClose }: Props) {
  const router = useRouter()
  const editing = state.mode === 'edit' && state.brew

  const [eventType,     setEventType]     = useState<ScheduledBrewEventType>(editing ? state.brew!.event_type : 'brew')
  const [date,          setDate]          = useState(editing ? state.brew!.scheduled_date : (state.date ?? ''))
  const [recipeId,      setRecipeId]      = useState(editing ? (state.brew!.recipe_id ?? '') : '')
  const [recipeName,    setRecipeName]    = useState(editing ? (state.brew!.recipe_name ?? '') : '')
  const [tankId,        setTankId]        = useState(editing ? (state.brew!.tank_id ?? '') : (initialTankId ?? ''))
  const [destTankId,    setDestTankId]    = useState(editing ? (state.brew!.dest_tank_id ?? '') : '')
  const [notes,         setNotes]         = useState(editing ? (state.brew!.notes ?? '') : '')
  const [status,        setStatus]        = useState<ScheduledBrewStatus>(editing ? state.brew!.status : 'planned')
  const [brewType,      setBrewType]      = useState<ScheduledBrewType | null>(editing ? (state.brew!.brew_type ?? null) : null)
  const [useCustomName, setUseCustomName] = useState(editing ? (!state.brew!.recipe_id && !!state.brew!.recipe_name) : false)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const sortedTanks = [...tanks]
    .filter(t => /^(FV|BBT)/i.test(t.name))
    .sort((a, b) => {
      const aFV = /^FV/i.test(a.name), bFV = /^FV/i.test(b.name)
      if (aFV && !bFV) return -1
      if (!aFV && bFV) return 1
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })

  const packDate = eventType === 'brew' && brewType && date
    ? addDays(date, brewType === 'ale' ? settings.ale_weeks * 7 : settings.lager_weeks * 7)
    : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      scheduled_date: date,
      recipe_id:   useCustomName ? null : (recipeId || null),
      recipe_name: useCustomName ? (recipeName || null) : null,
      tank_id:     tankId || null,
      notes:       notes || null,
      event_type:  eventType,
      brew_type:   eventType === 'brew' ? brewType : null,
      ...(eventType === 'transfer' ? { dest_tank_id: destTankId || null } : {}),
    }
    setSaveError(null)
    startTransition(async () => {
      try {
        if (editing) {
          await updateScheduledBrew(state.brew!.id, { ...payload, status })
        } else {
          await createScheduledBrew({ ...payload, pack_date: packDate ?? null })
        }
        router.refresh()
        onClose()
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function handleDelete() {
    if (!editing) return
    if (!confirm('Remove this event?')) return
    startTransition(async () => { await deleteScheduledBrew(state.brew!.id); router.refresh(); onClose() })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Edit event' : 'Schedule an event'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto">
          {/* Event type */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1.5">Event type</label>
            <div className="flex gap-1.5">
              {(['brew','pack','transfer'] as ScheduledBrewEventType[]).map(t => (
                <button key={t} type="button" onClick={() => setEventType(t)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    eventType === t ? EVENT_PILL[t] : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}>
                  {EVENT_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Status (edit only) */}
          {editing && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Status</label>
              <div className="flex gap-1.5 flex-wrap">
                {(['planned', 'confirmed', 'cancelled'] as ScheduledBrewStatus[]).map(s => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${status === s ? STATUS_PILL[s] : 'border-gray-200 text-gray-400'}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          {/* Ale / Lager (brew events only) */}
          {eventType === 'brew' && (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">Brew type</label>
              <div className="flex gap-2">
                {(['ale','lager'] as ScheduledBrewType[]).map(bt => (
                  <button key={bt} type="button"
                    onClick={() => setBrewType(prev => prev === bt ? null : bt)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      brewType === bt ? 'bg-primary text-primary-foreground border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                    {bt.charAt(0).toUpperCase() + bt.slice(1)}
                    <span className="block text-[10px] opacity-70">{bt === 'ale' ? `${settings.ale_weeks}w` : `${settings.lager_weeks}w`}</span>
                  </button>
                ))}
              </div>
              {packDate && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-xs text-purple-600 font-medium">
                    🔄 Transfer: {fmtDate(transferDate(packDate))}
                  </p>
                  <p className="text-xs text-blue-600 font-medium">
                    📦 Pack: {fmtDate(packDate)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Recipe */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Recipe</label>
              <button type="button" onClick={() => { setUseCustomName(!useCustomName); setRecipeId(''); setRecipeName('') }}
                className="text-[11px] text-primary hover:underline">
                {useCustomName ? 'Pick from list' : 'Type a name'}
              </button>
            </div>
            {useCustomName ? (
              <input type="text" value={recipeName} onChange={e => setRecipeName(e.target.value)}
                placeholder="e.g. Summer Lager"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            ) : (
              <select value={recipeId} onChange={e => setRecipeId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">— No recipe —</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.name}{r.style ? ` (${r.style})` : ''}</option>)}
              </select>
            )}
          </div>

          {/* Tank */}
          {eventType === 'transfer' ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">From (source tank)</label>
                <select value={tankId} onChange={e => setTankId(e.target.value)}
                  disabled={!!initialTankId}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white disabled:opacity-60">
                  <option value="">— Unassigned —</option>
                  {sortedTanks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">To (destination tank)</label>
                <select value={destTankId} onChange={e => setDestTankId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                  <option value="">— Unassigned —</option>
                  {sortedTanks.filter(t => t.id !== tankId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Tank (optional)</label>
              <select value={tankId} onChange={e => setTankId(e.target.value)}
                disabled={!!initialTankId}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white disabled:opacity-60">
                <option value="">— Unassigned —</option>
                {sortedTanks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>
          )}

          <div className="flex gap-2 pt-1">
            {editing && (
              <button type="button" onClick={handleDelete}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90">
              {editing ? 'Save' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
