import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { sanitiseSheet, sheetFromRecipe, withRecipeDefaults } from '@/lib/brew-sheet'
import { formatUserName } from '@/lib/utils'
import { isRtd } from '@/lib/rtd'
import { BrewSheetForm } from './BrewSheetForm'

export const dynamic = 'force-dynamic'
// Server actions here hold brew-day Slack lines for a minute before posting (logDigestActivity)
export const maxDuration = 120

export default async function BrewSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: brew }, { data: sheetRow }, { data: { user } }] = await Promise.all([
    supabase
      .from('brews')
      .select('id, beer_name, style, brew_day, tank_id, recipe_id, deleted_at, og_plato, target_og_plato, stage, tanks(name)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('brew_sheets').select('data, unchecked, source, updated_at, updated_by').eq('brew_id', id).maybeSingle(),
    supabase.auth.getUser(),
  ])
  if (!brew) notFound()

  // The recipe as a sheet: what a new sheet starts from, and what today's is
  // compared against when the day is finished.
  const [{ data: lines }, { data: recipe }] = brew.recipe_id
    ? await Promise.all([
        supabase.from('recipe_ingredients').select('name, addition_stage, quantity, unit, time_minutes, trigger').eq('recipe_id', brew.recipe_id).order('sort_order'),
        supabase.from('recipes').select('version, target_abv, target_og_plato, boil_duration_min, mash_temp_c, pitch_temp_c, ferment_temp_c').eq('id', brew.recipe_id).maybeSingle(),
      ])
    : [{ data: [] }, { data: null }]
  const baseline = brew.recipe_id ? withRecipeDefaults(sheetFromRecipe(lines ?? []), recipe) : null

  // No sheet yet: lay out the recipe's lines ready to tick off. Nothing is
  // written until the brewer changes something.
  let initial = sheetRow ? sanitiseSheet(sheetRow.data) : sheetFromRecipe(lines ?? [])
  // Boil time, mash target and yeast temperatures start from the recipe. Only
  // while the brew is in tank: a finished batch's sheet is left as it was written.
  if (!brew.deleted_at) initial = withRecipeDefaults(initial, recipe)

  // The last time this beer was brewed, to compare against through the day
  let previous: { id: string; brew_day: string; batch_code: string | null; data: ReturnType<typeof sanitiseSheet> } | null = null
  {
    // Same recipe or same name: a batch loaded from a paper sheet may carry only the name
    const earlier = supabase.from('brews').select('id, brew_day, batch_code').neq('id', brew.id).lte('brew_day', brew.brew_day).order('brew_day', { ascending: false }).limit(12)
    const name = brew.beer_name.replace(/[,()]/g, ' ').trim()
    const { data: candidates } = await (brew.recipe_id
      ? earlier.or(`recipe_id.eq.${brew.recipe_id},beer_name.ilike.${name}`)
      : earlier.ilike('beer_name', name))
    const ids = (candidates ?? []).map((c) => c.id)
    const { data: sheets } = ids.length ? await supabase.from('brew_sheets').select('brew_id, data').in('brew_id', ids) : { data: [] }
    const hit = (candidates ?? []).find((c) => (sheets ?? []).some((sh) => sh.brew_id === c.id))
    if (hit) previous = { ...hit, data: sanitiseSheet((sheets ?? []).find((sh) => sh.brew_id === hit.id)!.data) }
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
          baseline={baseline}
          recipeVersion={recipe?.version ?? null}
          targetAbv={recipe?.target_abv != null ? Number(recipe.target_abv) : null}
          targetOg={(brew.target_og_plato ?? recipe?.target_og_plato) != null ? Number(brew.target_og_plato ?? recipe?.target_og_plato) : null}
          previous={previous}
          me={formatUserName(user?.email ?? '')}
        />
      </div>
    </main>
  )
}
