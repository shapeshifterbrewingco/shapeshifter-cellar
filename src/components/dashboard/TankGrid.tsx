'use client'

import { TankCard } from '@/components/tank/TankCard'
import { UtilityStrip } from './UtilityStrip'
import type { TankDashboardData } from '@/types'
import type { RecipeOption } from './AssignBrewModal'
import type { FrigidReading } from '@/lib/frigid'

interface TankGridProps {
  tanks: TankDashboardData[]
  recipes: RecipeOption[]
  currentUser: string
  utilityTemps: FrigidReading[]
}

export function TankGrid({ tanks, recipes, currentUser, utilityTemps }: TankGridProps) {
  return (
    <div>
      {/* Utility strip: HLT / CLT / Glycol */}
      {utilityTemps.length > 0 && (
        <UtilityStrip readings={utilityTemps} />
      )}

      {/* All tanks — fermenters + brites together, auto-filling grid */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {tanks.map((t) => (
          <TankCard key={t.tank.id} data={t} recipes={recipes} currentUser={currentUser} allTanks={tanks} />
        ))}
      </div>
    </div>
  )
}
