import { after } from 'next/server'
import { TankGrid } from '@/components/dashboard/TankGrid'
import { AutoRefresh } from '@/components/dashboard/AutoRefresh'
import { QuickLog } from '@/components/dashboard/QuickLog'
import { BrewDayPanel } from '@/components/dashboard/BrewDayPanel'
import type { OpenBrewDay } from '@/components/dashboard/BrewDayPanel'
import { sanitiseSheet, sheetFromRecipe, sheetProgress, BREW_DAY_LISTS, bagsLabel } from '@/lib/brew-sheet'
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

  // Brew days still running: started, but OG not in yet. Their sheets feed the panel at the top.
  const openBrews = tanks.filter((t) => t.brew && t.brew.stage === 'active_ferment' && t.brew.og_plato == null)
  let brewDays: OpenBrewDay[] = []
  if (openBrews.length) {
    const ids = openBrews.map((t) => t.brew!.id)
    const recipeIds = [...new Set(openBrews.map((t) => t.brew!.recipe_id).filter((x): x is string => !!x))]
    const [{ data: sheets }, { data: lines }] = await Promise.all([
      supabase.from('brew_sheets').select('brew_id, data').in('brew_id', ids),
      recipeIds.length
        ? supabase.from('recipe_ingredients').select('recipe_id, name, addition_stage, quantity, unit, time_minutes, trigger').in('recipe_id', recipeIds).order('sort_order')
        : Promise.resolve({ data: [] as { recipe_id: string }[] }),
    ])
    const sheetBy = new Map((sheets ?? []).map((s) => [s.brew_id as string, s.data]))
    brewDays = openBrews.map((t) => {
      const b = t.brew!
      // No sheet saved yet: it will open laid out from the recipe, so count against that
      const sheet = sheetBy.has(b.id)
        ? sanitiseSheet(sheetBy.get(b.id))
        : sheetFromRecipe(((lines ?? []) as { recipe_id: string }[]).filter((l) => l.recipe_id === b.recipe_id) as never)
      const progress = sheetProgress(sheet)
      return {
        id: b.id,
        beer: b.beer_name,
        tank: t.tank.name,
        filled: progress.filled,
        total: progress.total,
        missing: [!sheet.fv.volume_l.trim() && 'volume', !sheet.fv.plato.trim() && 'gravity', !sheet.fv.ph.trim() && 'pH'].filter((x): x is string => !!x),
        next: BREW_DAY_LISTS.flatMap((k) => sheet[k].map((l) => ({ l, malt: k === 'malt' }))).filter(({ l }) => !l.done).slice(0, 3)
          .map(({ l, malt }) => [l.name, (malt && bagsLabel(l.amount, l.unit)) || [l.amount, l.unit].filter(Boolean).join(' ')].filter(Boolean).join(' ')),
      }
    })
  }

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
        <BrewDayPanel days={brewDays} />
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
