import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFrigidReadings } from '@/lib/frigid'

export const dynamic = 'force-dynamic'

// The brew sheet's live tank temperature polls here. A plain request for the
// same reason as /api/brew-sheet: a server action would re-render the long form
// under the brewer's thumbs every time it ran.
export async function GET(request: Request) {
  const tankId = new URL(request.url).searchParams.get('tank')
  if (!tankId) return NextResponse.json({ error: 'Bad request.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Signed out.' }, { status: 401 })

  const [{ data: tank }, readings] = await Promise.all([
    supabase.from('tanks').select('frigid_tank_name').eq('id', tankId).maybeSingle(),
    getFrigidReadings(),
  ])
  const probe = readings.find((r) => r.name === tank?.frigid_tank_name)
  return NextResponse.json({
    temperature: probe?.temperature != null ? Math.round(probe.temperature * 10) / 10 : null,
    setPoint: probe?.setPoint ?? null,
    readAt: probe?.lastTemperatureReading ?? null,
  })
}
