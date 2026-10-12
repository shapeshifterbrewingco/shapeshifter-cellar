// Posts to the brewery's Slack channel through an incoming webhook.
// With no SLACK_WEBHOOK_URL set, everything here is a quiet no-op, so the app
// behaves the same whether or not Slack is connected.

import { after } from 'next/server'

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

/** "carla@shapeshifterbrewing.com.au" -> "Carla" */
export function who(emailOrName: string | null | undefined): string {
  const local = (emailOrName ?? '').split('@')[0]
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Someone'
}

export const cellarLink = (label = 'Open cellar') => `<${APP_URL}|${label}>`

/** Slack treats &, < and > as markup. Beer names can contain them. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
