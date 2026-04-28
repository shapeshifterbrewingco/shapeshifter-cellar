import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

interface FrigidTank {
  name: string
  tank: string
  lastTemperatureReading: string
  temperature: number
  setPoint: number | string
  batchNumber?: string
  currentStage?: string | null
  notes?: unknown[]
}

export async function GET(request: Request) {
  // Protect with a simple secret so only Vercel cron can call this
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Fetch tanks to build frigid_name → tank_id map
  const { data: tanks, error: tanksError } = await supabase
    .from('tanks')
    .select('id, frigid_tank_name')
    .not('frigid_tank_name', 'is', null)

  if (tanksError) {
    return NextResponse.json({ error: tanksError.message }, { status: 500 })
  }

  const tankMap = new Map(tanks.map((t: { id: string; frigid_tank_name: string }) => [t.frigid_tank_name, t.id]))

  // Fetch from Frigid
  const frigidRes = await fetch(
    `${process.env.FRIGID_API_URL}/batch/list?includeInactiveTanks=1`,
    { headers: { 'x-api-key': process.env.FRIGID_API_KEY! }, next: { revalidate: 0 } }
  )

  if (!frigidRes.ok) {
    return NextResponse.json({ error: 'Frigid API error' }, { status: 502 })
  }

  const frigidData: FrigidTank[] = await frigidRes.json()

  // Build insert rows for tanks we recognise
  const rows = frigidData
    .filter((f): f is FrigidTank => !!f && typeof f.tank === 'string' && tankMap.has(f.tank))
    .map((f) => ({
      tank_id: tankMap.get(f.tank)!,
      recorded_at: f.lastTemperatureReading,
      temperature_c: f.temperature,
      set_point_c: typeof f.setPoint === 'string' ? parseFloat(f.setPoint) : f.setPoint,
    }))
    .filter((r) => !isNaN(r.temperature_c))

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('temperature_readings')
      .insert(rows)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ inserted: rows.length, at: new Date().toISOString() })
}
