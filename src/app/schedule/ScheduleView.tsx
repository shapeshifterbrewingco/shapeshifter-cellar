'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Calendar, List, X, Trash2 } from 'lucide-react'
import { createScheduledBrew, updateScheduledBrew, deleteScheduledBrew } from './actions'
import type { ScheduledBrew, ScheduledBrewStatus, ScheduledBrewEventType, ScheduledBrewType } from '@/types'

interface RecipeOption { id: string; name: string; style: string | null }
interface TankOption  { id: string; name: string }

// ── Styles ────────────────────────────────────────────────────────────────────

const EVENT_PILL: Record<ScheduledBrewEventType, string> = {
  brew:     'bg-red-50 text-red-800 border-red-200',
  pack:     'bg-blue-50 text-blue-800 border-blue-200',
  transfer: 'bg-purple-50 text-purple-800 border-purple-200',
}
const EVENT_LABEL: Record<ScheduledBrewEventType, string> = {
  brew: 'Brew', pack: 'Pack', transfer: 'Transfer',
}
const EVENT_DOT: Record<ScheduledBrewEventType, string> = {
  brew: 'bg-red-400', pack: 'bg-blue-400', transfer: 'bg-purple-400',
}
const STATUS_LABELS: Record<ScheduledBrewStatus, string> = {
  planned:   'Planned',
  confirmed: 'Confirmed',
  brewing:   'Brewing',
  done:      'Done',
  cancelled: 'Cancelled',
}
const STATUS_PILL: Record<ScheduledBrewStatus, string> = {
  planned:   'bg-gray-100 text-gray-600 border-gray-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  brewing:   'bg-amber-50 text-amber-700 border-amber-200',
  done:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-400 border-red-200',
}

// Brew pill colour depends on confirmed status; pack/transfer always fixed
function brewPillClass(b: ScheduledBrew): string {
  if ((b.event_type ?? 'brew') === 'brew') {
    return b.status === 'confirmed'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : EVENT_PILL.brew
  }
  return EVENT_PILL[b.event_type ?? 'brew']
}

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

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
function monthOffset(year: number, month: number, offset: number) {
  const d = new Date(year, month + offset, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalState { mode: 'create' | 'edit'; brew?: ScheduledBrew; date?: string }

function BrewModal({ state, recipes, tanks, onClose }: {
  state: ModalState; recipes: RecipeOption[]; tanks: TankOption[]; onClose: () => void
}) {
  const router = useRouter()
  const editing = state.mode === 'edit' && state.brew
  const [eventType,     setEventType]     = useState<ScheduledBrewEventType>(editing ? state.brew!.event_type : 'brew')
  const [date,          setDate]          = useState(editing ? state.brew!.scheduled_date : (state.date ?? ''))
  const [recipeId,      setRecipeId]      = useState(editing ? (state.brew!.recipe_id ?? '') : '')
  const [recipeName,    setRecipeName]    = useState(editing ? (state.brew!.recipe_name ?? '') : '')
  const [tankId,        setTankId]        = useState(editing ? (state.brew!.tank_id ?? '') : '')
  const [destTankId,    setDestTankId]    = useState(editing ? (state.brew!.dest_tank_id ?? '') : '')
  const [notes,         setNotes]         = useState(editing ? (state.brew!.notes ?? '') : '')
  const [status,        setStatus]        = useState<ScheduledBrewStatus>(editing ? state.brew!.status : 'planned')
  const [brewType,      setBrewType]      = useState<ScheduledBrewType | null>(editing ? (state.brew!.brew_type ?? null) : null)
  const [useCustomName, setUseCustomName] = useState(editing ? (!state.brew!.recipe_id && !!state.brew!.recipe_name) : false)
  const [saveError, setSaveError] = useState<string | null>(null)
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
    ? addDays(date, brewType === 'ale' ? 28 : 42)
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
      // only send dest_tank_id for transfer events — avoids column-not-found
      // errors if migration 015 hasn't been applied yet for other event types
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
                    <span className="block text-[10px] opacity-70">{bt === 'ale' ? '4 weeks' : '6 weeks'}</span>
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

          {/* Tank — for transfers show From + To, otherwise single selector */}
          {eventType === 'transfer' ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">From (source tank)</label>
                <select value={tankId} onChange={e => setTankId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
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

// ── Calendar ──────────────────────────────────────────────────────────────────

function CalendarView({ year, month, brews, onDayClick, onBrewClick, onDrop }: {
  year: number; month: number; brews: ScheduledBrew[]
  onDayClick: (date: string) => void
  onBrewClick: (brew: ScheduledBrew) => void
  onDrop: (id: string, newDate: string) => void
}) {
  const today = new Date()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const [dragOver, setDragOver] = useState<string | null>(null)

  const brewsByDate = new Map<string, ScheduledBrew[]>()
  for (const b of brews) {
    const list = brewsByDate.get(b.scheduled_date) ?? []
    list.push(b)
    brewsByDate.set(b.scheduled_date, list)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAYS.map((d, i) => {
          const isWknd = i === 0 || i === 6
          return (
            <div key={d} className={`py-2 text-center text-xs font-semibold ${
              isWknd ? 'text-gray-300 bg-gray-50' : 'text-gray-400'
            }`}>{d}</div>
          )
        })}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const col = i % 7
          const isWknd = col === 0 || col === 6

          if (!day) return (
            <div key={`empty-${i}`} className={`min-h-[90px] border-b border-r border-gray-50 last:border-r-0 ${isWknd ? 'bg-gray-50/60' : ''}`} />
          )

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayBrews = brewsByDate.get(dateStr) ?? []
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
          const isOver  = dragOver === dateStr

          return (
            <div
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(dateStr) }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null) }}
              onDrop={e => {
                e.preventDefault()
                const id = e.dataTransfer.getData('eventId')
                if (id) onDrop(id, dateStr)
                setDragOver(null)
              }}
              className={`min-h-[90px] border-b border-r border-gray-50 last:border-r-0 p-1.5 cursor-pointer transition-colors group ${
                isOver   ? 'bg-primary/5 ring-inset ring-2 ring-primary/20' :
                isWknd   ? 'bg-gray-50/60 hover:bg-gray-100/60' :
                           'hover:bg-gray-50'
              }`}
            >
              {/* Day number */}
              <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                isToday ? 'bg-primary text-white' :
                isWknd  ? 'text-gray-300' :
                          'text-gray-600 group-hover:text-gray-900'
              }`}>{day}</div>

              {/* Event pills */}
              <div className="flex flex-col gap-0.5">
                {dayBrews.map(b => {
                  const et = b.event_type ?? 'brew'
                  const name = b.recipe?.name ?? b.recipe_name ?? 'Unnamed'
                  const style = b.recipe?.style
                  const tank  = et === 'transfer'
                    ? [b.tank?.name, b.dest_tank?.name].filter(Boolean).join(' → ') || b.tank?.name
                    : b.tank?.name
                  return (
                    <button
                      key={b.id}
                      type="button"
                      draggable
                      onDragStart={e => {
                        e.stopPropagation()
                        e.dataTransfer.setData('eventId', b.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={e => { e.stopPropagation(); onBrewClick(b) }}
                      className={`w-full text-left px-1.5 py-1 rounded border cursor-grab active:cursor-grabbing ${
                        brewPillClass(b)
                      } ${b.status === 'cancelled' ? 'opacity-40' : ''}`}
                    >
                      <p className="text-[8px] font-bold uppercase tracking-wide leading-tight mb-0.5 opacity-60">
                        {et === 'brew'
                          ? (b.status === 'confirmed' ? 'Confirmed Brew' : 'Planned Brew')
                          : EVENT_LABEL[et]}
                      </p>
                      {tank  && <p className="text-[9px] font-normal opacity-60 leading-tight truncate">{tank}</p>}
                      <p className={`text-[10px] font-bold leading-tight truncate ${b.status === 'cancelled' ? 'line-through' : ''}`}>{name}</p>
                      {style && <p className="text-[9px] font-normal opacity-60 leading-tight truncate">{style}</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

function ListView({ brews, onBrewClick }: { brews: ScheduledBrew[]; onBrewClick: (b: ScheduledBrew) => void }) {
  const sorted = [...brews].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  const today  = new Date().toISOString().slice(0, 10)

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
        <p className="text-gray-400 text-sm">No events scheduled yet.</p>
      </div>
    )
  }

  const groups = new Map<string, ScheduledBrew[]>()
  for (const b of sorted) {
    const [y, m] = b.scheduled_date.split('-')
    const key = `${y}-${m}`
    const list = groups.get(key) ?? []
    list.push(b)
    groups.set(key, list)
  }

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([key, items]) => {
        const [y, m] = key.split('-')
        const label = `${MONTHS[parseInt(m) - 1]} ${y}`
        return (
          <div key={key}>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{label}</p>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-50">
              {items.map(b => {
                const et = b.event_type ?? 'brew'
                const d = new Date(b.scheduled_date + 'T00:00:00')
                const isPast = b.scheduled_date < today
                return (
                  <button key={b.id} type="button" onClick={() => onBrewClick(b)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-4">
                    <div className="w-10 text-center flex-shrink-0">
                      <p className="text-xs text-gray-400 leading-none">{d.toLocaleDateString('en-AU', { weekday: 'short' })}</p>
                      <p className={`text-lg font-black leading-tight ${isPast && b.status === 'planned' ? 'text-gray-300' : 'text-gray-900'}`}>
                        {d.getDate()}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${brewPillClass(b)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT[et]}`} />
                          {EVENT_LABEL[et]}
                        </span>
                        {b.brew_type && (
                          <span className="text-[10px] text-gray-400 font-medium capitalize">{b.brew_type}</span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {b.recipe?.name ?? b.recipe_name ?? 'Unnamed'}
                      </p>
                      {(b.tank || b.dest_tank || b.recipe?.style) && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {et === 'transfer'
                            ? [b.tank?.name, b.dest_tank?.name].filter(Boolean).join(' → ')
                            : [b.tank?.name, b.recipe?.style].filter(Boolean).join(' · ')
                          }
                        </p>
                      )}
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[11px] font-medium border flex-shrink-0 ${STATUS_PILL[b.status]}`}>
                      {STATUS_LABELS[b.status]}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ScheduleView({ brews: initialBrews, recipes, tanks }: {
  brews: ScheduledBrew[]; recipes: RecipeOption[]; tanks: TankOption[]
}) {
  const today = new Date()
  const [view,  setView]  = useState<'month' | 'list'>('month')
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [modal, setModal] = useState<ModalState | null>(null)

  const [brews, setBrews] = useState(initialBrews)
  useEffect(() => { setBrews(initialBrews) }, [initialBrews])

  const [, startTransition] = useTransition()

  function prev() {
    const { year: y, month: m } = monthOffset(year, month, -1)
    setYear(y); setMonth(m)
  }
  function next() {
    const { year: y, month: m } = monthOffset(year, month, 1)
    setYear(y); setMonth(m)
  }

  function handleDrop(id: string, newDate: string) {
    setBrews(prev => prev.map(b => b.id === id ? { ...b, scheduled_date: newDate } : b))
    startTransition(async () => {
      try { await updateScheduledBrew(id, { scheduled_date: newDate }) }
      catch { setBrews(initialBrews) }
    })
  }

  // Build range label for toolbar
  const end = monthOffset(year, month, 2)
  const rangeLabel = year === end.year
    ? `${MONTHS[month].slice(0, 3)} – ${MONTHS[end.month].slice(0, 3)} ${year}`
    : `${MONTHS[month].slice(0, 3)} ${year} – ${MONTHS[end.month].slice(0, 3)} ${end.year}`

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {view === 'month' && (
            <>
              <button onClick={prev} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900 w-48 text-center">{rangeLabel}</span>
              <button onClick={next} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setView('month')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'month' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              <Calendar className="h-3.5 w-3.5" /> Month
            </button>
            <button onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'list' ? 'bg-primary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
          </div>
          <button
            onClick={() => setModal({ mode: 'create', date: today.toISOString().slice(0, 10) })}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-sm font-medium px-3 py-1.5 rounded-lg hover:opacity-90">
            <Plus className="h-4 w-4" /> Schedule
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-red-50 text-red-800 border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Planned brew
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-50 text-emerald-800 border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Confirmed brew
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${EVENT_PILL.transfer}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT.transfer}`} /> Transfer
        </span>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${EVENT_PILL.pack}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${EVENT_DOT.pack}`} /> Pack
        </span>
      </div>

      {/* Content */}
      {view === 'month' ? (
        <div className="space-y-8">
          {[0, 1, 2].map(offset => {
            const { year: y, month: m } = monthOffset(year, month, offset)
            const monthBrews = brews.filter(b => {
              const [by, bm] = b.scheduled_date.split('-').map(Number)
              return by === y && bm === m + 1
            })
            return (
              <div key={`${y}-${m}`}>
                <p className="text-sm font-bold text-gray-700 mb-2 px-0.5">{MONTHS[m]} {y}</p>
                <CalendarView
                  year={y} month={m} brews={monthBrews}
                  onDayClick={date => setModal({ mode: 'create', date })}
                  onBrewClick={brew => setModal({ mode: 'edit', brew })}
                  onDrop={handleDrop}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <ListView brews={brews} onBrewClick={brew => setModal({ mode: 'edit', brew })} />
      )}

      {modal && (
        <BrewModal state={modal} recipes={recipes} tanks={tanks} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
