import { NextResponse } from 'next/server'
import { getFrigidReadings } from '@/lib/frigid'
import { recordTemperatures } from '@/lib/temperature-log'

export const dynamic = 'force-dynamic'

// Called on a schedule to keep the temperature history filled in. The route
// is outside the login wall, so it only answers to the cron secret, and it
// refuses outright if that secret has not been configured.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const readings = await getFrigidReadings()
  if (readings.length === 0) {
    return NextResponse.json({ error: 'Frigid returned no readings' }, { status: 502 })
  }

  const result = await recordTemperatures(readings)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ inserted: result.inserted, at: new Date().toISOString() })
}
