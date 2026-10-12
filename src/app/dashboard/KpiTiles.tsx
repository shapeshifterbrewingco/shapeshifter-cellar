'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'

/** `lead` is the short label on the left: a tank name, or a date */
export interface KpiRow { lead: string; title: string; sub: string; right: string; rightSub: string; /** Where tapping the row goes */ href?: string }
export interface Kpi {
  label: string
  value: string
  sub: string
  /** What is behind the number. A tile with rows can be tapped open. */
  rows?: KpiRow[]
  rowsTitle?: string
}

const CARD = 'rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_1px_2px_rgba(16,24,40,0.05)]'

/** The headline numbers. Tapping one that has detail behind it opens a summary underneath. */
export function KpiTiles({ kpis }: { kpis: Kpi[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const shown = kpis.find((k) => k.label === open && k.rows?.length)

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => {
          const body = (
            <>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900 mt-0.5">{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{k.sub}</p>
            </>
          )
          if (!k.rows?.length) return <div key={k.label} className={`${CARD} px-5 py-4`}>{body}</div>
          const isOpen = open === k.label
          return (
            <button key={k.label} type="button" onClick={() => setOpen(isOpen ? null : k.label)} aria-expanded={isOpen}
              className={`${CARD} relative px-5 py-4 text-left active:bg-gray-50 ${isOpen ? 'ring-2 ring-primary/40' : ''}`}>
              {body}
              <ChevronDown className={`absolute right-3 top-3.5 h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
          )
        })}
      </div>

      {shown && (
        <section className={`${CARD} mt-3 overflow-hidden`} aria-label={shown.rowsTitle ?? shown.label}>
          <h2 className="px-5 pt-3.5 pb-2 text-sm font-semibold text-gray-900">{shown.rowsTitle ?? shown.label}</h2>
          <ul className="divide-y divide-gray-100">
            {shown.rows!.map((r, i) => {
              const body = (
                <>
                  <span className="w-14 flex-shrink-0 text-sm font-semibold tabular-nums text-gray-900">{r.lead}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">{r.title}</span>
                    <span className="block text-xs text-gray-400 truncate">{r.sub}</span>
                  </span>
                  <span className="flex-shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-gray-900">{r.right}</span>
                    <span className="block text-xs text-gray-400 tabular-nums">{r.rightSub}</span>
                  </span>
                  {r.href && <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />}
                </>
              )
              return (
                <li key={`${r.lead}-${i}`}>
                  {r.href
                    ? <Link href={r.href} className="flex items-center gap-3 px-5 py-2.5 active:bg-gray-50 hover:bg-gray-50">{body}</Link>
                    : <div className="flex items-center gap-3 px-5 py-2.5">{body}</div>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
