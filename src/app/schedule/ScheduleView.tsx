'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Calendar, List, Package } from 'lucide-react'
import { updateScheduledBrew } from './actions'
import { PackagingSplitModal } from '@/components/dashboard/PackagingSplitModal'
import { BrewModal } from '@/components/schedule/BrewModal'
import type { ScheduledBrew, ScheduledBrewStatus, ScheduledBrewEventType, AppSettings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'

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

interface ModalState { mode: 'create' | 'edit'; brew?: ScheduledBrew; date?: string }

// ── Calendar ──────────────────────────────────────────────────────────────────

function CalendarView({ year, month, brews, onDayClick, onBrewClick, onSplitClick, onDrop }: {
  year: number; month: number; brews: ScheduledBrew[]
  onDayClick: (date: string) => void
  onBrewClick: (brew: ScheduledBrew) => void
  onSplitClick: (brew: ScheduledBrew) => void
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
    <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b-2 border-gray-300">
        {DAYS.map((d, i) => {
          const isWknd = i === 0 || i === 6
          return (
            <div key={d} className={`py-2 text-center text-xs font-bold bg-primary ${
              isWknd ? 'text-white/40' : 'text-white'
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
            <div key={`empty-${i}`} className={`min-h-[90px] border-b border-r border-gray-200 last:border-r-0 ${isWknd ? 'bg-gray-50/60' : ''}`} />
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
              className={`min-h-[90px] border-b border-r border-gray-200 last:border-r-0 p-1.5 cursor-pointer transition-colors group ${
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
                    <div
                      key={b.id}
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
                      <div className="flex items-start justify-between gap-0.5">
                        <p className="text-[8px] font-bold uppercase tracking-wide leading-tight mb-0.5 opacity-60">
                          {et === 'brew'
                            ? (b.status === 'confirmed' ? 'Confirmed Brew' : 'Planned Brew')
                            : EVENT_LABEL[et]}
                        </p>
                        {et === 'pack' && (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); onSplitClick(b) }}
                            className="opacity-50 hover:opacity-100 flex-shrink-0 -mt-0.5">
                            <Package className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                      {tank  && <p className="text-[9px] font-normal opacity-60 leading-tight truncate">{tank}</p>}
                      <p className={`text-[10px] font-bold leading-tight truncate ${b.status === 'cancelled' ? 'line-through' : ''}`}>{name}</p>
                      {style && <p className="text-[9px] font-normal opacity-60 leading-tight truncate">{style}</p>}
                    </div>
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

function ListView({ brews, onBrewClick, onSplitClick }: { brews: ScheduledBrew[]; onBrewClick: (b: ScheduledBrew) => void; onSplitClick: (b: ScheduledBrew) => void }) {
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
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-2 px-1">{label}</p>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-50">
              {items.map(b => {
                const et = b.event_type ?? 'brew'
                const d = new Date(b.scheduled_date + 'T00:00:00')
                const isPast = b.scheduled_date < today
                return (
                  <div key={b.id} onClick={() => onBrewClick(b)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-4 cursor-pointer">
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
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {b.recipe?.name ?? b.recipe_name ?? 'Unnamed'}
                      </p>
                      {(b.tank || b.dest_tank || b.recipe?.style) && (
                        <p className="text-xs font-medium text-gray-500 mt-0.5 truncate">
                          {et === 'transfer'
                            ? [b.tank?.name, b.dest_tank?.name].filter(Boolean).join(' → ')
                            : [b.tank?.name, b.recipe?.style].filter(Boolean).join(' · ')
                          }
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {et === 'pack' && (
                        <button type="button"
                          onClick={e => { e.stopPropagation(); onSplitClick(b) }}
                          className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full font-medium transition-colors">
                          <Package className="h-3 w-3" />
                          Splits
                        </button>
                      )}
                      <div className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_PILL[b.status]}`}>
                        {STATUS_LABELS[b.status]}
                      </div>
                    </div>
                  </div>
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

export function ScheduleView({ brews: initialBrews, recipes, tanks, settings = DEFAULT_SETTINGS }: {
  brews: ScheduledBrew[]; recipes: RecipeOption[]; tanks: TankOption[]; settings?: AppSettings
}) {
  const today = new Date()
  const [view,  setView]  = useState<'month' | 'list'>('month')
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [modal, setModal] = useState<ModalState | null>(null)

  const [brews, setBrews] = useState(initialBrews)
  useEffect(() => { setBrews(initialBrews) }, [initialBrews])

  const [splitBrew, setSplitBrew] = useState<ScheduledBrew | null>(null)
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

      {/* Legend + drag hint */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div className="flex flex-wrap gap-2">
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
      {view === 'month' && (
        <span className="text-[11px] text-gray-400 hidden sm:block">Drag events to reschedule</span>
      )}
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
                <p className="text-base font-black text-gray-800 mb-2 px-0.5">{MONTHS[m]} {y}</p>
                <CalendarView
                  year={y} month={m} brews={monthBrews}
                  onDayClick={date => setModal({ mode: 'create', date })}
                  onBrewClick={brew => setModal({ mode: 'edit', brew })}
                  onSplitClick={setSplitBrew}
                  onDrop={handleDrop}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <ListView brews={brews} onBrewClick={brew => setModal({ mode: 'edit', brew })} onSplitClick={setSplitBrew} />
      )}

      {modal && (
        <BrewModal state={modal} recipes={recipes} tanks={tanks} settings={settings} onClose={() => setModal(null)} />
      )}

      {splitBrew && (
        <PackagingSplitModal
          scheduledBrewId={splitBrew.id}
          title={splitBrew.recipe?.name ?? splitBrew.recipe_name ?? 'Unnamed'}
          subtitle={[splitBrew.tank?.name, splitBrew.scheduled_date].filter(Boolean).join(' · ')}
          defaultHopLoad={settings.default_hop_load}
          settings={settings}
          onClose={() => setSplitBrew(null)}
        />
      )}
    </div>
  )
}
