import { NextResponse, type NextRequest } from 'next/server'
import { listEvents } from '@/lib/planner/google'
import { staffEmail } from '@/lib/planner/session'

export const dynamic = 'force-dynamic'

const isDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export async function GET(request: NextRequest) {
  if (!(await staffEmail())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')
  if (!isDate(from) || !isDate(to)) return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  try {
    return NextResponse.json({ events: await listEvents(from!, to!) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
