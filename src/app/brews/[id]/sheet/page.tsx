import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { sanitiseSheet, sheetFromRecipe, withRecipeDefaults } from '@/lib/brew-sheet'
import { formatUserName } from '@/lib/utils'
import { isRtd } from '@/lib/rtd'
import { BrewSheetForm } from './BrewSheetForm'

export const dynamic = 'force-dynamic'

export default async function BrewSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: brew }, { data: sheetRow }, { data: { user } }] = await Promise.all([
    supabase
      .from('brews')
      .select('id, beer_name, style, brew_day, tank_id, recipe_id, deleted_at, og_plato, stage, tanks(name)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('brew_sheets').select('data, unchecked, source, updated_at, updated_by').eq('brew_id', id).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!brew) notFound()

  // No sheet yet: lay out the recipe's lines ready to tick off. Nothing is
  // written until the brewer changes something.
  let initial = sheetRow ? sanitiseSheet(sheetRow.data) : null
  if (!initial) {
    const { data: lines } = brew.recipe_id
      ? await supabase
          .from('recipe_ingredients')
          .select('name, addition_stage, quantity, unit, time_minutes, trigger')
          .eq('recipe_id', brew.recipe_id)
          .order('sort_order')
      : { data: [] }
    initial = sheetFromRecipe(lines ?? [])
  }
  // Boil time, mash target and yeast temperatures start from the recipe. Only
  // while the brew is in tank: a finished batch's sheet is left as it was written.
  if (!brew.deleted_at) {
    const { data: recipe } = brew.recipe_id
      ? await supabase.from('recipes').select('boil_duration_min, mash_temp_c, pitch_temp_c, ferment_temp_c').eq('id', brew.recipe_id).maybeSingle()
      : { data: null }
    initial = withRecipeDefaults(initial, recipe)
  }

  const tank = Array.isArray(brew.tanks) ? brew.tanks[0] : brew.tanks
  const finished = !!brew.deleted_at

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-4 md:px-6 py-4 max-w-3xl mx-auto">
        <Link href={finished ? '/history' : '/'} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 -ml-1 mb-2">
          <ChevronLeft className="h-4 w-4" />{finished ? 'History' : 'Cellar'}
        </Link>
        <BrewSheetForm
          brew={{
            id: brew.id,
            beer_name: brew.beer_name,
            style: brew.style,
            brew_day: brew.brew_day,
            tank_id: brew.tank_id,
            tank_name: (tank as { name?: string } | null)?.name ?? '',
          }}
          initial={initial}
          initialUnchecked={sheetRow?.unchecked ?? []}
          exists={!!sheetRow}
          finished={brew.og_plato != null || brew.stage !== 'active_ferment'}
          rtd={isRtd(brew.beer_name, brew.style)}
          me={formatUserName(user?.email ?? '')}
        />
      </div>
    </main>
  )
}
