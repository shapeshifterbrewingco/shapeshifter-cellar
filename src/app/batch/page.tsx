import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// /batch?beer=Nordic: open the batch number page for that beer's batch in tank (newest first).
// Linked from Life OS, which knows the beer but not the brew id.
export default async function BatchByBeer({ searchParams }: { searchParams: Promise<{ beer?: string }> }) {
  const { beer } = await searchParams
  const name = (beer ?? '').trim()
  if (!name) notFound()
  const supabase = await createClient()
  const { data } = await supabase
    .from('brews')
    .select('id, beer_name, stage')
    .is('deleted_at', null)
    .ilike('beer_name', `%${name.replace(/[%_]/g, '')}%`)
    .order('brew_day', { ascending: false })
    .limit(5)
  const brew = (data ?? []).find((b) => b.stage !== 'packaged') ?? data?.[0]
  if (!brew) notFound()
  redirect(`/brews/${brew.id}/batch`)
}
