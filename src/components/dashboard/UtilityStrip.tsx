'use client'

import { useState, useTransition } from 'react'
import { X, Pencil } from 'lucide-react'
import { setTankTarget } from '@/app/tanks/actions'
import type { FrigidReading } from '@/lib/frigid'

const TEMP_COLOURS: Record<string, string> = {
  HLT:    'text-orange-600',
  CLT:    'text-blue-600',
  Glycol: 'text-violet-600',
}

const LINE_COLOURS: Record<string, string> = {
  HLT:    '#ea580c',
  CLT:    '#2563eb',
  Glycol: '#7c3aed',
}

const SUBTITLES: Record<string, string> = {
  HLT:    'Hot Liquor',
  CLT:    'Cold Liquor',
  Glycol: 'Glycol Chiller',
}

// ── Compact sparkline ──────────────────────────────────────────────────────────

function MiniSparkline({ history, colour }: { history: FrigidReading['history']; colour: string }) {
  const w = 200, h = 36
  if (!history?.length) {
    return <div style={{ width: w, height: h }} className="flex items-center"><span className="text-[10px] text-gray-300">No data</span></div>
  }

  const now = Date.now()
  const buckets: { sum: number; count: number }[] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))
  for (const r of history) {
    const ageH = (now - new Date(r.recorded_at).getTime()) / 3_600_000
    const idx = 23 - Math.floor(ageH)
    if (idx >= 0 && idx < 24) { buckets[idx].sum += r.temperature_c; buckets[idx].count++ }
  }
  const filled = buckets
    .map((b, i) => ({ x: i, temp: b.count > 0 ? b.sum / b.count : null }))
    .filter((b): b is { x: number; temp: number } => b.temp !== null)

  if (filled.length < 2) return <div style={{ width: w, height: h }} />

  const temps = filled.map(b => b.temp)
  const minT = Math.min(...temps) - 0.5
  const maxT = Math.max(...temps) + 0.5
  const range = maxT - minT || 1

  const toX = (xi: number) => (xi / 23) * w
  const toY = (t: number) => ((maxT - t) / range) * h

  let line = '', area = ''
  for (const b of filled) {
    const x = toX(b.x).toFixed(1), y = toY(b.temp).toFixed(1)
    if (!line) { line = `M ${x} ${y}`; area = `M ${x} ${h} L ${x} ${y}` }
    else { line += ` L ${x} ${y}`; area += ` L ${x} ${y}` }
  }
  const lastX = toX(filled[filled.length - 1].x).toFixed(1)
  area += ` L ${lastX} ${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`mg-${colour.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity={0.2} />
          <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#mg-${colour.replace('#','')})`} />
      <path d={line} stroke={colour} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {(() => {
        const last = filled[filled.length - 1]
        return <circle cx={toX(last.x)} cy={toY(last.temp)} r={2.5} fill={colour} />
      })()}
    </svg>
  )
}

// ── Expanded modal ─────────────────────────────────────────────────────────────

function ExpandedModal({ reading, onClose }: { reading: FrigidReading; onClose: () => void }) {
  const colour = LINE_COLOURS[reading.name] ?? '#6b7280'
  const tempColour = TEMP_COLOURS[reading.name] ?? 'text-gray-700'
  const w = 440, h = 180

  const now = Date.now()
  const buckets: { sum: number; count: number }[] = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }))
  for (const r of reading.history ?? []) {
    const ageH = (now - new Date(r.recorded_at).getTime()) / 3_600_000
    const idx = 23 - Math.floor(ageH)
    if (idx >= 0 && idx < 24) { buckets[idx].sum += r.temperature_c; buckets[idx].count++ }
  }
  const filled = buckets
    .map((b, i) => ({ x: i, temp: b.count > 0 ? b.sum / b.count : null, label: (() => { const d = new Date(now - (23 - i) * 3_600_000); return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }) })() }))
    .filter((b): b is { x: number; temp: number; label: string } => b.temp !== null)

  const axisL = 28, axisB = 18, plotW = w - axisL, plotH = h - axisB
  const temps = filled.map(b => b.temp)
  const rawMin = Math.min(...temps), rawMax = Math.max(...temps)
  const pad = Math.max((rawMax - rawMin) * 0.2, 0.5)
  const minT = rawMin - pad, maxT = rawMax + pad, range = maxT - minT || 1

  const toX = (xi: number) => axisL + (xi / 23) * plotW
  const toY = (t: number) => ((maxT - t) / range) * plotH

  let line = '', area = ''
  for (const b of filled) {
    const x = toX(b.x).toFixed(1), y = toY(b.temp).toFixed(1)
    if (!line) { line = `M ${x} ${y}`; area = `M ${x} ${plotH} L ${x} ${y}` }
    else { line += ` L ${x} ${y}`; area += ` L ${x} ${y}` }
  }
  if (filled.length) area += ` L ${toX(filled[filled.length-1].x).toFixed(1)} ${plotH} Z`

  const yTicks = Array.from({ length: 4 }, (_, i) => minT + (range * i) / 3)
  const xTicks = [0, 6, 12, 18, 23]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{reading.name} — Temperature</h2>
            <p className="text-xs text-gray-400 mt-0.5">Last 24 hours</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-black tabular-nums ${tempColour}`}>
              {reading.temperature?.toFixed(1)}°C
            </span>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-4">
          <defs>
            <linearGradient id={`eg-${colour.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.25} />
              <stop offset="100%" stopColor={colour} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={axisL} y1={toY(t)} x2={w} y2={toY(t)} stroke="#e5e7eb" strokeWidth={0.5} />
              <text x={axisL - 4} y={toY(t) + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{t.toFixed(1)}</text>
            </g>
          ))}
          {xTicks.map(idx => {
            const d = new Date(now - (23 - idx) * 3_600_000)
            const label = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
            return (
              <g key={idx}>
                <line x1={toX(idx)} y1={0} x2={toX(idx)} y2={plotH + 3} stroke="#e5e7eb" strokeWidth={0.5} />
                <text x={toX(idx)} y={h - 4} textAnchor="middle" fontSize={8} fill="#9ca3af">{label}</text>
              </g>
            )
          })}
          <path d={area} fill={`url(#eg-${colour.replace('#','')})`} />
          <path d={line} stroke={colour} strokeWidth={1.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {filled.length > 0 && (() => {
            const last = filled[filled.length - 1]
            return <circle cx={toX(last.x)} cy={toY(last.temp)} r={2.5} fill={colour} />
          })()}
        </svg>
      </div>
    </div>
  )
}

// ── Individual card ────────────────────────────────────────────────────────────

function UtilityCard({ r, onExpand }: { r: FrigidReading; onExpand: () => void }) {
  const tempColour = TEMP_COLOURS[r.name] ?? 'text-gray-700'
  const lineColour = LINE_COLOURS[r.name] ?? '#6b7280'
  const hasHistory = (r.history?.length ?? 0) > 0

  const [editing, setEditing] = useState(false)
  const [setpointInput, setSetpointInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [, startTransition] = useTransition()

  function handleEditOpen() {
    setSetpointInput(r.setPoint != null && r.setPoint !== 200 ? String(r.setPoint) : '')
    setStatusMsg(null)
    setEditing(true)
  }

  function handleSave() {
    if (!r.tankId) return
    const val = parseFloat(setpointInput)
    if (isNaN(val) || val < -20 || val > 100) {
      setStatusMsg({ text: 'Enter -20 to 100°C', ok: false })
      return
    }
    setSaving(true)
    startTransition(async () => {
      const res = await setTankTarget(r.tankId!, val)
      setSaving(false)
      if (res.success) {
        setStatusMsg({ text: '✓', ok: true })
        setTimeout(() => { setEditing(false); setStatusMsg(null) }, 800)
      } else {
        setStatusMsg({ text: res.message, ok: false })
      }
    })
  }

  const spDisplay = r.setPoint != null && r.setPoint !== 200 ? `${r.setPoint.toFixed(1)}°C` : '—'

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-4">

        {/* Clickable: name + temp + sparkline */}
        <div
          onClick={() => hasHistory && onExpand()}
          className={`flex items-center gap-4 flex-1 min-w-0 ${hasHistory ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
        >
          <div className="flex-shrink-0 min-w-[80px]">
            <p className="text-xs text-gray-500 font-bold">{SUBTITLES[r.name] ?? r.name}</p>
            <div className="mt-0.5">
              {r.temperature != null
                ? <span className={`text-xl font-black tabular-nums ${tempColour}`}>{r.temperature.toFixed(1)}°C</span>
                : <span className="text-xl font-black tabular-nums text-gray-300">—°C</span>}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <MiniSparkline history={r.history ?? []} colour={lineColour} />
          </div>
        </div>

        {/* Setpoint column — right-justified, not part of the clickable area */}
        {r.tankId && (
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-gray-500 font-bold">Set Point</p>
            <div className="flex items-center justify-end gap-1 mt-0.5">
              {editing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    value={setpointInput}
                    onChange={e => { setSetpointInput(e.target.value); setStatusMsg(null) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSave()
                      if (e.key === 'Escape') setEditing(false)
                    }}
                    autoFocus
                    className="w-20 text-xl font-black tabular-nums text-right border-b-2 border-primary bg-transparent focus:outline-none"
                  />
                  {saving ? (
                    <span className="text-xs text-gray-400">…</span>
                  ) : statusMsg ? (
                    <span className={`text-xs font-bold ${statusMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{statusMsg.text}</span>
                  ) : (
                    <button type="button" onClick={() => setEditing(false)}
                      className="text-gray-300 hover:text-gray-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <span className={`text-xl font-black tabular-nums ${tempColour}`}>{spDisplay}</span>
                  <button type="button" onClick={handleEditOpen}
                    className="text-gray-300 hover:text-gray-500 transition-colors ml-1">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Strip ──────────────────────────────────────────────────────────────────────

export function UtilityStrip({ readings }: { readings: FrigidReading[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!readings.length) return null

  return (
    <>
      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: `repeat(${readings.length}, 1fr)` }}>
        {readings.map(r => (
          <UtilityCard key={r.name} r={r} onExpand={() => setExpanded(r.name)} />
        ))}
      </div>

      {expanded && (() => {
        const r = readings.find(x => x.name === expanded)
        return r ? <ExpandedModal reading={r} onClose={() => setExpanded(null)} /> : null
      })()}
    </>
  )
}
