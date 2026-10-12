// Posts to the brewery's Slack channel through an incoming webhook.
// With no SLACK_WEBHOOK_URL set, everything here is a quiet no-op, so the app
// behaves the same whether or not Slack is connected.

import { after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const APP_URL = 'https://shapeshifter-cellar.vercel.app'

export const slackConfigured = () => !!process.env.SLACK_WEBHOOK_URL

/** Send one message. Never throws: Slack being down must not break the app. */
export async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, unfurl_links: false }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[slack] webhook returned', res.status)
    return res.ok
  } catch (err) {
    console.error('[slack] post failed:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Log something a person just did. Sent after the response has gone back, so
 * the brewer never waits on Slack.
 */
export function logActivity(text: string) {
  if (!slackConfigured()) return
  try {
    after(() => postSlack(text))
  } catch {
    // Outside a request (a script, a test): send it directly
    void postSlack(text)
  }
}

// How long a message waits for a second action on the same tank before it is
// sent on its own, and how close together two actions must be to be joined.
const HOLD_MS = 20_000
const JOIN_WINDOW_MS = 45_000

/**
 * Log something that often comes in pairs, like putting a tank on chill and
 * then dropping its set point. The first message is held for a few seconds; if
 * a second arrives for the same key, the two go to Slack as one sentence.
 *
 * @param key   What groups the pair, e.g. the tank and the person
 * @param text  The full sentence, sent as is when nothing follows it
 * @param tail  The same action as a clause that can follow "and", e.g. "set it to -0.5°C"
 */
export function logGroupedActivity(key: string, text: string, tail: string) {
  if (!slackConfigured()) return
  const run = async () => {
    try {
      const db = createServiceClient()
      const since = new Date(Date.now() - JOIN_WINDOW_MS).toISOString()
      // Claim a message already waiting on this key. Marking it sent is what claims it.
      const { data: waiting } = await db
        .from('slack_outbox').update({ sent_at: new Date().toISOString() })
        .eq('group_key', key).is('sent_at', null).gte('created_at', since)
        .select('body')
      if (waiting?.length) {
        await postSlack(`${waiting[0].body.replace(/\.$/, '')} and ${tail}.`)
        return
      }
      const { data: mine, error } = await db.from('slack_outbox').insert({ group_key: key, body: text }).select('id').single()
      if (error || !mine) { await postSlack(text); return }
      await new Promise((r) => setTimeout(r, HOLD_MS))
      // Still unclaimed after the wait: nothing followed, so it goes on its own
      const { data: still } = await db
        .from('slack_outbox').update({ sent_at: new Date().toISOString() })
        .eq('id', mine.id).is('sent_at', null).select('id')
      if (still?.length) await postSlack(text)
    } catch (err) {
      console.error('[slack] grouped send failed:', err instanceof Error ? err.message : err)
      await postSlack(text)
    }
  }
  try { after(run) } catch { void run() }
}

/** Send anything left waiting, e.g. if the server stopped mid-hold. Run by the poller. */
export async function flushSlackOutbox(): Promise<number> {
  if (!slackConfigured()) return 0
  const db = createServiceClient()
  const { data } = await db
    .from('slack_outbox').update({ sent_at: new Date().toISOString() })
    .is('sent_at', null).lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString())
    .select('body')
  for (const row of data ?? []) await postSlack(row.body)
  // Keep the table small
  await db.from('slack_outbox').delete().lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
  return data?.length ?? 0
}

/** "carla@shapeshifterbrewing.com.au" -> "Carla" */
export function who(emailOrName: string | null | undefined): string {
  const local = (emailOrName ?? '').split('@')[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Someone'
}

export const cellarLink = (label = 'Open cellar') => `<${APP_URL}|${label}>`

/** Slack treats &, < and > as markup. Beer names can contain them. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
