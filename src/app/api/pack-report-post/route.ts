// Re-send one batch's packaging report to #packagingreports, for testing the
// Slack connection or re-posting one that was deleted. Locked with CRON_SECRET.
// POST { brew_id, test?: true }. With test, the post is not remembered, so
// deleting it in Slack leaves nothing behind.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { botConfigured } from '@/lib/slack-bot'
import { publishPackReport } from '@/lib/pack-report-post'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!botConfigured()) return NextResponse.json({ error: 'SLACK_BOT_TOKEN is not set' }, { status: 503 })

  const { brew_id, test } = await request.json().catch(() => ({})) as { brew_id?: string; test?: boolean }
  if (!brew_id) return NextResponse.json({ error: 'Send a brew_id' }, { status: 400 })

  const db = createServiceClient()
  const { data: before } = await db.from('packaging_reports').select('slack_ts').eq('brew_id', brew_id).maybeSingle()
  const ts = await publishPackReport(brew_id, { create: true })
  if (!ts) return NextResponse.json({ error: 'Not posted. Check the function logs for the Slack error.' }, { status: 502 })
  if (test && ts !== before?.slack_ts) {
    await db.from('packaging_reports').update({ slack_ts: before?.slack_ts ?? null }).eq('brew_id', brew_id)
  }
  return NextResponse.json({ ok: true, ts })
}
