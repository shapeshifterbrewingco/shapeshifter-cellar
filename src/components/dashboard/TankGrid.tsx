'use client'

import { useState, useEffect } from 'react'
import { List } from 'lucide-react'
import { TankCard } from '@/components/tank/TankCard'
import { UtilityStrip } from './UtilityStrip'
import type { TankDashboardData, AppSettings } from '@/types'
import type { RecipeOption } from './AssignBrewModal'
import type { FrigidReading } from '@/lib/frigid'

type ViewMode = 'small' | 'medium' | 'large' | 'list'
type CardSize = 'small' | 'medium' | 'large'

const STORAGE_KEY = 'cellar-view'

const GRID_COLS: Record<CardSize, string> = {
  small:  'repeat(auto-fill, minmax(143px, 1fr))',
  medium: 'repeat(auto-fill, minmax(190px, 1fr))',
  large:  'repeat(auto-fill, minmax(238px, 1fr))',
}

interface TankGridProps {
  tanks: TankDashboardData[]
  recipes: RecipeOption[]
  currentUser: string
  utilityTemps: FrigidReading[]
  settings: AppSettings
}

export function TankGrid({ tanks, recipes, currentUser, utilityTemps, settings }: TankGridProps) {
  const [view, setView] = useState<ViewMode>('medium')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null
      if (saved && ['small', 'medium', 'large', 'list'].includes(saved)) {
        setView(saved)
      }
    } catch {}
    setHydrated(true)
  }, [])

  function handleView(v: ViewMode) {
    setView(v)
    try { localStorage.setItem(STORAGE_KEY, v) } catch {}
  }

  const isList = view === 'list'
  const cardSize: CardSize = isList ? 'medium' : (view as CardSize)

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        {/* Stage legend */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Fermenting',    colour: 'bg-amber-400' },
            { label: 'Diacetyl Rest', colour: 'bg-violet-400' },
            { label: 'VDK Pass',      colour: 'bg-orange-400' },
            { label: 'On Chill',      colour: 'bg-blue-500' },
          ].map(({ label, colour }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
              <span className={`w-2 h-2 rounded-full ${colour}`} />
              {label}
            </span>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 font-medium hidden sm:block">View:</span>
          <div className="flex items-center rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {(['small', 'medium', 'large'] as const).map((v) => (
              <button
                key={v}
                onClick={() => handleView(v)}
                title={v === 'small' ? 'Small cards' : v === 'medium' ? 'Medium cards' : 'Large cards'}
                className={`px-3 py-1.5 text-xs font-bold transition-colors border-r border-gray-200 ${
                  hydrated && view === v ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {v === 'small' ? 'S' : v === 'medium' ? 'M' : 'L'}
              </button>
            ))}
            <button
              onClick={() => handleView('list')}
              title="List view"
              className={`px-3 py-1.5 flex items-center transition-colors ${
                hydrated && view === 'list' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Utility strip */}
      {utilityTemps.length > 0 && <UtilityStrip readings={utilityTemps} />}

      {/* Tanks */}
      {isList ? (
        <div className="space-y-2">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            <span className="w-4 flex-shrink-0" />
            <span className="w-12 flex-shrink-0">Tank</span>
            <span className="flex-1">Beer</span>
            <span className="hidden sm:block flex-shrink-0 w-24">Stage</span>
            <span className="hidden md:block flex-shrink-0 w-12 text-right">Gravity</span>
            <span className="hidden md:block flex-shrink-0 w-10 text-right">ABV</span>
            <span className="flex-shrink-0 w-12 text-right">Temp</span>
            <span className="hidden sm:block flex-shrink-0 w-8 text-right">Days</span>
          </div>
          {tanks.map(t => (
            <TankCard
              key={t.tank.id}
              data={t}
              recipes={recipes}
              currentUser={currentUser}
              allTanks={tanks}
              settings={settings}
              cardSize="medium"
              listMode
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: GRID_COLS[cardSize] }}>
          {tanks.map(t => (
            <TankCard
              key={t.tank.id}
              data={t}
              recipes={recipes}
              currentUser={currentUser}
              allTanks={tanks}
              settings={settings}
              cardSize={cardSize}
            />
          ))}
        </div>
      )}
    </div>
  )
}
