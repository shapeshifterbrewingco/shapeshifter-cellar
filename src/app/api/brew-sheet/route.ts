import { NextResponse } from 'next/server'
import { saveBrewSheet } from '@/app/brews/sheet-actions'

export const dynamic = 'force-dynamic'

// The brew sheet's autosave posts here rather than calling the server action
// directly. A server action makes Next re-render the page it was called from,
// and on a long form that the brewer is halfway down, that reads as the page
// refreshing and jumping back to the top. A plain request does not.
export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 }) }
  const input = body as Parameters<typeof saveBrewSheet>[0]
  if (!input || typeof input.brew_id !== 'string' || !input.data) {
    return NextResponse.json({ ok: false, message: 'Bad request.' }, { status: 400 })
  }
  try {
    return NextResponse.json(await saveBrewSheet(input))
  } catch (err) {
    console.error('[brew-sheet] save failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, message: 'Not saved. Try again.' }, { status: 500 })
  }
}
