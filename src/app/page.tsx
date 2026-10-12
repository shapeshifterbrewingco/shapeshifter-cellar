import { after } from 'next/server'
import { TankGrid } from '@/components/dashboard/TankGrid'
import { AutoRefresh } from '@/components/dashboard/AutoRefresh'
import { QuickLog } from '@/components/dashboard/QuickLog'
import { getDashboardData } from '@/lib/dashboard'
import { getFrigidReadings, utilityReadings } from '@/lib/frigid'
import { recordTemperatures } from '@/lib/temperature-log'
import { nextBrewsByTank } from '@/lib/planner/next-brews'
import { greeting, specialGreeting } from '@/lib/greeting'
import { Hello } from '@/components/layout/Hello'
import { getBirthday } from '@/app/settings/actions'
import { breweryToday } from '@/lib/dates'
import { formatUserName } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
import { getSettings } from '@/app/settings/actions'
import type { RecipeOption } from '@/components/dashboard/AssignBrewModal'
import type { FrigidReading } from '@/lib/frigid'

export const dynamic = 'force-dynamic'

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString()

export default async function DashboardPage() {
  const supabase = await createClient()

  // Everything that does not depend on anything else, in one round trip.
  // A failure here is thrown to error.tsx: an empty cellar must never be shown
  // because a query failed.
  const [frigid, nextBrews, settings, { data: { user } }, recipesResult, utilityRowsResult] = await Promise.all([
    getFrigidReadings(),
    nextBrewsByTank(),
    getSettings(),
    supabase.auth.getUser(),
    supabase
      .from('recipes')
      .select('id, name, style, target_og_plato, brew_volume_l')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('tanks')
      .select('id, frigid_tank_name')
      .eq('is_utility', true),
  ])

  if (recipesResult.error) throw recipesResult.error

  const utilityIdByName = new Map(
    (utilityRowsResult.data ?? []).map(t => [t.frigid_tank_name as string, t.id as string])
  )
  const utilityIds = [...utilityIdByName.values()]
  const since = hoursAgo(25)

  const [tanks, historyResult] = await Promise.all([
    getDashboardData(supabase, frigid, nextBrews),
    utilityIds.length > 0
      ? supabase
          .from('temperature_readings')
          .select('tank_id, recorded_at, temperature_c')
          .in('tank_id', utilityIds)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: true })
      : Promise.resolve({ data: [] as { tank_id: string; recorded_at: string; temperature_c: number }[] }),
  ])

  const historyByTankId = new Map<string, { recorded_at: string; temperature_c: number }[]>()
  for (const r of historyResult.data ?? []) {
    if (!historyByTankId.has(r.tank_id)) historyByTankId.set(r.tank_id, [])
    historyByTankId.get(r.tank_id)!.push(r)
  }

  const utilityTemps: FrigidReading[] = utilityReadings(frigid).map(ft => {
    const tankId = utilityIdByName.get(ft.name) ?? null
    return { ...ft, tankId, history: tankId ? (historyByTankId.get(tankId) ?? []) : [] }
  })

  const today = breweryToday()
  const firstName = user?.email ? formatUserName(user.email) : ''
  const birthday = await getBirthday()
  const isSpecial = !!specialGreeting(firstName, { birthday })
  const hello = greeting(firstName, {
    birthday,
    brewDay: Object.values(nextBrews).some((b) => b.scheduled_date === today),
  })

  // Keep the temperature history filling in while anyone has the cellar open.
  // Runs after the page is sent, so it costs the brewer nothing.
  after(async () => {
    const result = await recordTemperatures(frigid)
    if (result.error) console.error('[dashboard] temperature log failed:', result.error)
  })

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 py-2">
        <AutoRefresh seconds={60} />
        {frigid.length === 0 && (
          <p role="alert" className="mb-3 rounded-xl bg-yeast/30 ring-1 ring-yeast px-4 py-3 text-sm text-charcoal">
            <strong className="font-semibold">Frigid is not responding.</strong> Tank temperatures and set points are
            hidden until it does, so check the Frigid panel directly.
          </p>
        )}
        <p className="md:hidden px-1 pt-1 pb-2 text-lg font-semibold tracking-tight text-gray-900"><Hello text={hello} name={firstName} special={isSpecial} /></p>
        <QuickLog tanks={tanks} currentUser={user?.email ?? user?.id ?? 'Unknown'} />
        <TankGrid
          tanks={tanks}
          recipes={(recipesResult.data ?? []) as RecipeOption[]}
          currentUser={user?.email ?? user?.id ?? 'Unknown'}
          utilityTemps={utilityTemps}
          settings={settings}
          greeting={<Hello text={hello} name={firstName} special={isSpecial} />}
        />
      </div>
    </main>
  )
}
