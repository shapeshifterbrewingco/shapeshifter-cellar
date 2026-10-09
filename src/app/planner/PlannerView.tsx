'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronLeft, ChevronRight, RotateCw, Send, SquarePen, Check, X, Loader2, CalendarDays, MessageSquare } from 'lucide-react'
import type { Plan } from '@/lib/planner/tools'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalEvent { id: string; date: string; endDate: string; title: string; description: string; time: string | null }

type ApiMessage = { role: 'user' | 'assistant'; content: unknown }

type PlanStatus = 'pending' | 'applying' | 'applied' | 'dismissed'
type Item =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; tools: string[] }
  | { kind: 'plan'; plan: Plan; status: PlanStatus; results?: { ok: boolean; message: string }[] }

interface Saved { items: Item[]; api: ApiMessage[]; notes: string[] }

const TOOL_LABEL: Record<string, string> = {
  get_calendar: 'Reading the calendar',
  get_stock_forecast: 'Checking stock and run-outs',
  get_packaging_splits: 'Reading the Splits sheet',
  allocate_tanks: 'Running the tank solver',
  propose_calendar_changes: 'Preparing the plan',
}

const STARTERS = [
  'What runs out first, and is a brew booked for it?',
  'Which tanks are free in November?',
  'Check the next 6 weeks: every pack has a brite and no clashes?',
]

// ── Dates (local, never toISOString - Adelaide is ahead of UTC) ──────────────

const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const prettyDate = (k: string) => fromKey(k).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

function gridFor(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = addDays(first, -((first.getDay() + 6) % 7)) // back to Monday
  const last = new Date(year, month + 1, 0)
  const end = addDays(last, (7 - last.getDay()) % 7)        // forward to Sunday
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

function eventStyle(title: string) {
  const t = title.trim().toUpperCase()
  if (t.startsWith('BREW')) return 'bg-red-50 text-red-800 border-red-200'
  if (t.startsWith('TRANSFER')) return 'bg-purple-50 text-purple-800 border-purple-200'
  if (t.startsWith('PACK')) return 'bg-blue-50 text-blue-800 border-blue-200'
  if (/\bA\/?L\b|LEAVE/.test(t)) return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function Calendar({ refreshKey, onPick }: { refreshKey: number; onPick: (e: CalEvent) => void }) {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const days = useMemo(() => gridFor(cursor.y, cursor.m), [cursor])

  useEffect(() => {
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetch(`/api/planner/calendar?from=${key(days[0])}&to=${key(days[days.length - 1])}`, { signal: ctrl.signal })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || r.statusText); return d })
      .then((d) => setEvents(d.events))
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message) })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [days, refreshKey, tick])

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) {
      for (let d = fromKey(e.date); key(d) <= e.endDate; d = addDays(d, 1)) {
        const k = key(d)
        m.set(k, [...(m.get(k) || []), e])
      }
    }
    return m
  }, [events])

  const move = (n: number) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-white">
        <h1 className="text-lg font-bold text-primary mr-auto">{MONTHS[cursor.m]} {cursor.y}</h1>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        <button onClick={() => setTick((t) => t + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Refresh"><RotateCw className="h-4 w-4" /></button>
        <button onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })} className="px-3 py-1 rounded-lg border text-sm hover:bg-gray-50">Today</button>
        <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
        <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
      </div>
      {error && <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b">Calendar could not load: {error}</p>}
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.55fr)_minmax(0,0.55fr)] border-b bg-gray-50 text-xs font-semibold text-gray-500">
        {DOW.map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.55fr)_minmax(0,0.55fr)] auto-rows-[minmax(7rem,1fr)] bg-white">
        {days.map((d) => {
          const k = key(d)
          const inMonth = d.getMonth() === cursor.m
          const isToday = k === key(today)
          const weekend = d.getDay() === 0 || d.getDay() === 6
          return (
            <div key={k} className={`border-r border-b p-1 min-w-0 ${weekend ? 'bg-gray-50/70' : ''} ${inMonth ? '' : 'opacity-45'}`}>
              <div className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white font-bold' : 'text-gray-500'}`}>{d.getDate()}</div>
              <div className="flex flex-col gap-0.5">
                {(byDay.get(k) || []).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onPick(e)}
                    title={`${e.title}${e.description ? `\n\n${e.description}` : ''}\n\nClick to ask about it`}
                    className={`text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border truncate hover:brightness-95 ${eventStyle(e.title)}`}
                  >
                    {e.time && <span className="opacity-60 mr-1">{e.time}</span>}{e.title}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-3 px-4 py-2 border-t bg-white text-xs text-gray-500">
        {[['Brew', 'BREW'], ['Transfer', 'TRANSFER'], ['Pack', 'PACK'], ['Leave', 'AL'], ['Other', '']].map(([l, t]) => (
          <span key={l} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded border ${eventStyle(t)}`} />{l}</span>
        ))}
        <span className="ml-auto">Brewery Schedule, live from Google Calendar</span>
      </div>
    </div>
  )
}

// ── Plan card ─────────────────────────────────────────────────────────────────

const ACTION_STYLE = { create: 'bg-emerald-100 text-emerald-800', update: 'bg-amber-100 text-amber-800', delete: 'bg-red-100 text-red-800' }

function PlanCard({ item, onApply, onDismiss }: { item: Extract<Item, { kind: 'plan' }>; onApply: () => void; onDismiss: () => void }) {
  const { plan, status, results } = item
  return (
    <div className="rounded-xl border-2 border-primary/30 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-primary/5 border-b">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Proposed calendar changes</p>
        <p className="text-sm font-medium">{plan.summary}</p>
      </div>
      <ul className="divide-y text-sm">
        {plan.changes.map((c, i) => (
          <li key={i} className="px-3 py-2">
            <div className="flex items-start gap-2">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${ACTION_STYLE[c.action]}`}>{c.action === 'create' ? 'add' : c.action === 'update' ? 'change' : 'delete'}</span>
              <div className="min-w-0">
                {c.action === 'delete'
                  ? <p className="line-through text-gray-500">{c.before && `${prettyDate(c.before.date)} - ${c.before.title}`}</p>
                  : <p className="font-medium">{prettyDate(c.date || c.before?.date || '')}{c.end_date ? ` to ${prettyDate(c.end_date)}` : ''} - {c.title || c.before?.title}</p>}
                {c.action === 'update' && c.before && <p className="text-xs text-gray-500">was {prettyDate(c.before.date)} - {c.before.title}</p>}
                <p className="text-xs text-gray-500">{c.reason}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {results && (
        <ul className="px-3 py-2 border-t text-xs space-y-0.5">
          {results.map((r, i) => <li key={i} className={r.ok ? 'text-emerald-700' : 'text-red-600'}>{r.ok ? 'Done: ' : 'Failed: '}{r.message}</li>)}
        </ul>
      )}
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-gray-50">
        {status === 'pending' && <>
          <button onClick={onApply} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold hover:opacity-90"><Check className="h-4 w-4" />Apply to calendar</button>
          <button onClick={onDismiss} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm hover:bg-white"><X className="h-4 w-4" />Dismiss</button>
          <span className="text-xs text-gray-500 ml-auto">Nothing changes until you apply</span>
        </>}
        {status === 'applying' && <span className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Writing to the calendar...</span>}
        {status === 'applied' && <span className="text-sm font-medium text-emerald-700">Applied</span>}
        {status === 'dismissed' && <span className="text-sm text-gray-500">Dismissed - calendar unchanged</span>}
      </div>
    </div>
  )
}

// ── Chat ──────────────────────────────────────────────────────────────────────

function Chat({ email, draft, setDraft, onApplied }: { email: string; draft: string; setDraft: (s: string) => void; onApplied: () => void }) {
  const storeKey = `planner:v1:${email}`
  const [state, setState] = useState<Saved>({ items: [], api: [], notes: [] })
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const loaded = useRef(false)

  useEffect(() => {
    // Read after mount: localStorage doesn't exist during the server render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const raw = localStorage.getItem(storeKey); if (raw) setState(JSON.parse(raw)) } catch { /* fresh start */ }
    loaded.current = true
  }, [storeKey])

  useEffect(() => {
    if (!loaded.current) return
    try { localStorage.setItem(storeKey, JSON.stringify(state)) } catch { /* storage full or blocked - chat still works */ }
  }, [state, storeKey])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [state.items, activity])

  const send = useCallback(async (text: string) => {
    const clean = text.trim()
    if (!clean || busy) return
    setError(null)
    setDraft('')
    // Notes about plans applied or dismissed since the last turn ride along with the message
    const content = state.notes.length ? `${state.notes.map((n) => `[System note: ${n}]`).join('\n')}\n\n${clean}` : clean
    const api: ApiMessage[] = [...state.api, { role: 'user', content }]
    setState((s) => ({ ...s, notes: [], items: [...s.items, { kind: 'user', text: clean }, { kind: 'assistant', text: '', tools: [] }] }))
    setBusy(true)

    const patchLast = (fn: (a: Extract<Item, { kind: 'assistant' }>) => Extract<Item, { kind: 'assistant' }>) =>
      setState((s) => {
        const items = [...s.items]
        for (let i = items.length - 1; i >= 0; i--) {
          const it = items[i]
          if (it.kind === 'assistant') { items[i] = fn(it); break }
        }
        return { ...s, items }
      })

    try {
      const res = await fetch('/api/planner/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: api }) })
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let finished = false
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const ev = JSON.parse(line)
          if (ev.type === 'text') { setActivity(null); patchLast((a) => ({ ...a, text: a.text + ev.delta })) }
          else if (ev.type === 'tool') { setActivity(TOOL_LABEL[ev.name] || ev.name); patchLast((a) => ({ ...a, tools: [...a.tools, ev.name] })) }
          else if (ev.type === 'plan') {
            setState((s) => ({ ...s, items: [...s.items, { kind: 'plan', plan: ev.plan, status: 'pending' }, { kind: 'assistant', text: '', tools: [] }] }))
          }
          else if (ev.type === 'done') { finished = true; setState((s) => ({ ...s, api: ev.messages })) }
          else if (ev.type === 'error') throw new Error(ev.message)
        }
      }
      if (!finished) throw new Error('The reply was cut off. Try again.')
    } catch (e) {
      setError((e as Error).message)
      // Keep the question in the transcript, but don't leave a half turn in the model's history
      setState((s) => ({ ...s, api: [...s.api, { role: 'user', content }, { role: 'assistant', content: '(That reply failed part way. Nothing was changed.)' }] }))
    } finally {
      setBusy(false)
      setActivity(null)
      setState((s) => ({ ...s, items: s.items.filter((it) => !(it.kind === 'assistant' && !it.text.trim() && !it.tools.length)) }))
    }
  }, [busy, setDraft, state.api, state.notes])

  const setPlan = (id: string, patch: Partial<Extract<Item, { kind: 'plan' }>>) =>
    setState((s) => ({ ...s, items: s.items.map((it) => (it.kind === 'plan' && it.plan.id === id ? { ...it, ...patch } : it)) }))

  async function apply(plan: Plan) {
    setPlan(plan.id, { status: 'applying' })
    try {
      const res = await fetch('/api/planner/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      const results = data.results as { ok: boolean; message: string }[]
      setPlan(plan.id, { status: 'applied', results })
      setState((s) => ({ ...s, notes: [...s.notes, `User pressed Apply on plan ${plan.id}. Results: ${results.map((r) => (r.ok ? 'OK ' : 'FAILED ') + r.message).join('; ')}`] }))
      onApplied()
    } catch (e) {
      setPlan(plan.id, { status: 'pending' })
      setError(`Apply failed: ${(e as Error).message}`)
    }
  }

  function dismiss(plan: Plan) {
    setPlan(plan.id, { status: 'dismissed' })
    setState((s) => ({ ...s, notes: [...s.notes, `User dismissed plan ${plan.id}. Nothing was applied.`] }))
  }

  function newChat() {
    if (busy) return
    if (state.items.length && !confirm('Start a new conversation? This one will be cleared.')) return
    setState({ items: [], api: [], notes: [] })
    setError(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-white">
        <h2 className="font-bold text-primary mr-auto">Production planner</h2>
        <button onClick={newChat} className="flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg hover:bg-gray-100 text-gray-600" title="New conversation"><SquarePen className="h-4 w-4" />New</button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {!state.items.length && (
          <div className="text-sm text-gray-600 space-y-3">
            <p>Ask about the brew schedule, tanks or stock run-outs. I can read the Brewery Schedule, the Sales App stock and the Packaging Splits sheet.</p>
            <p>I can change the calendar, but only after we agree a plan and you press <span className="font-semibold">Apply</span>.</p>
            <div className="flex flex-col gap-2 pt-1">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left px-3 py-2 rounded-lg border bg-white hover:border-primary/40 hover:bg-primary/5">{s}</button>
              ))}
            </div>
          </div>
        )}
        {state.items.map((it, i) => {
          if (it.kind === 'user') return <div key={i} className="ml-8 rounded-2xl rounded-br-sm bg-primary text-white px-3.5 py-2 text-sm whitespace-pre-wrap">{it.text}</div>
          if (it.kind === 'plan') return <PlanCard key={i} item={it} onApply={() => apply(it.plan)} onDismiss={() => dismiss(it.plan)} />
          return (
            <div key={i} className="text-sm">
              {it.tools.length > 0 && (
                <p className="text-xs text-gray-400 mb-1">{[...new Set(it.tools)].map((t) => TOOL_LABEL[t] || t).join(' · ')}</p>
              )}
              {it.text && (
                <div className="planner-md rounded-2xl rounded-bl-sm bg-white border px-3.5 py-2.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{it.text}</ReactMarkdown>
                </div>
              )}
            </div>
          )
        })}
        {activity && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />{activity}...</p>}
        {busy && !activity && <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Thinking...</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(draft) }} className="p-3 border-t bg-white flex gap-2 items-end">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
          rows={2}
          placeholder="Ask about the schedule..."
          className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="h-10 w-10 flex items-center justify-center rounded-xl bg-primary text-white disabled:opacity-40" aria-label="Send">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PlannerView({ email }: { email: string }) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<'calendar' | 'chat'>('chat')

  const pick = (e: CalEvent) => {
    setDraft(`${draft ? `${draft} ` : ''}"${e.title}" on ${prettyDate(e.date)}: `)
    setTab('chat')
  }

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-dvh flex flex-col">
      <div className="md:hidden flex border-b bg-white">
        {(['calendar', 'chat'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500'}`}>
            {t === 'calendar' ? <CalendarDays className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}{t === 'calendar' ? 'Calendar' : 'Planner'}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className={`${tab === 'calendar' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col border-r`}>
          <Calendar refreshKey={refreshKey} onPick={pick} />
        </div>
        <div className={`${tab === 'chat' ? 'flex' : 'hidden'} md:flex w-full md:w-[420px] lg:w-[480px] flex-col`}>
          <Chat email={email} draft={draft} setDraft={setDraft} onApplied={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>
    </div>
  )
}
