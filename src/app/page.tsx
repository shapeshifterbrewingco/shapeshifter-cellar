import { TankGrid } from '@/components/dashboard/TankGrid'
import { getDashboardData } from '@/lib/dashboard'
import { getUtilityTemps } from '@/lib/frigid'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/app/settings/actions'
import { DEFAULT_SETTINGS } from '@/types'
import type { RecipeOption } from '@/components/dashboard/AssignBrewModal'
import type { FrigidReading } from '@/lib/frigid'
import type { AppSettings } from '@/types'

export const revalidate = 60

export default async function DashboardPage() {
  let tanks: import('@/types').TankDashboardData[] = []
  let recipes: RecipeOption[] = []
  let currentUser = 'Unknown'
  let utilityTemps: FrigidReading[] = []
  let settings = DEFAULT_SETTINGS

  try {
    const [supabase, frigidTemps, fetchedSettings] = await Promise.all([
      createClient(),
      getUtilityTemps(),
      getSettings(),
    ])
    settings = fetchedSettings
    utilityTemps = frigidTemps

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      currentUser = user.email ?? user.id
      tanks = await getDashboardData(supabase)

      const { data } = await supabase
        .from('recipes')
        .select('id, name, style, target_og_plato, brew_volume_l')
        .is('deleted_at', null)
        .order('name')
      recipes = (data ?? []) as RecipeOption[]

      // Fetch 24h temp history + tank IDs for utility vessels (HLT, CLT, Glycol)
      if (frigidTemps.length > 0) {
        const { data: utilityTankRows } = await supabase
          .from('tanks')
          .select('id, frigid_tank_name')
          .in('frigid_tank_name', frigidTemps.map(f => f.name))

        const tankIdByName = new Map(
          (utilityTankRows ?? []).map(t => [t.frigid_tank_name as string, t.id as string])
        )
        const utilityIds = [...tankIdByName.values()]

        let histByTankId = new Map<string, { recorded_at: string; temperature_c: number }[]>()
        if (utilityIds.length > 0) {
          const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
          const { data: histReadings } = await supabase
            .from('temperature_readings')
            .select('tank_id, recorded_at, temperature_c')
            .in('tank_id', utilityIds)
            .gte('recorded_at', since)
            .order('recorded_at', { ascending: true })

          for (const r of histReadings ?? []) {
            if (!histByTankId.has(r.tank_id)) histByTankId.set(r.tank_id, [])
            histByTankId.get(r.tank_id)!.push(r)
          }
        }

        utilityTemps = utilityTemps.map(ft => ({
          ...ft,
          tankId: tankIdByName.get(ft.name) ?? null,
          history: tankIdByName.has(ft.name)
            ? (histByTankId.get(tankIdByName.get(ft.name)!) ?? [])
            : [],
        }))
      }
    }
  } catch {
    // Fall back to mock data if DB isn't reachable
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 py-2">
        <TankGrid tanks={tanks} recipes={recipes} currentUser={currentUser} utilityTemps={utilityTemps} settings={settings} />
      </div>
    </main>
  )
}
