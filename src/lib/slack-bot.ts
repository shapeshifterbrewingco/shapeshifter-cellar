// Slack through the app's bot token, for what the webhook in slack.ts cannot
// do: post photos, and edit a message after it has gone out. Only used for the
// packaging report in #packagingreports. Everything here is a quiet no-op
// without SLACK_BOT_TOKEN, and nothing throws: Slack must never break the app.

const API = 'https://slack.com/api'

export const botConfigured = () => !!process.env.SLACK_BOT_TOKEN

/** #packagingreports, unless pointed somewhere else for testing */
export const packagingChannel = () => process.env.SLACK_PACKAGING_CHANNEL || 'C03HBEQGKAT'

type SlackResult = { ok: boolean; error?: string; [k: string]: unknown }

async function call(method: string, body: Record<string, unknown>, form = false): Promise<SlackResult> {
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8',
      },
      body: form
        ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]))
        : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as SlackResult
    if (!data.ok) console.error(`[slack-bot] ${method}:`, data.error)
    return data
  } catch (err) {
    console.error(`[slack-bot] ${method} failed:`, err instanceof Error ? err.message : err)
    return { ok: false, error: 'request_failed' }
  }
}

/**
 * Upload an image to Slack without sharing it anywhere, so a message can show
 * it in an image block. Returns the Slack file ID, or null.
 */
export async function uploadImage(bytes: Uint8Array, filename: string): Promise<string | null> {
  const start = await call('files.getUploadURLExternal', { filename, length: bytes.byteLength }, true)
  if (!start.ok) return null
  const uploadUrl = start.upload_url as string
  const fileId = start.file_id as string
  try {
    const put = await fetch(uploadUrl, { method: 'POST', body: bytes as BodyInit, signal: AbortSignal.timeout(30000) })
    if (!put.ok) { console.error('[slack-bot] upload returned', put.status); return null }
  } catch (err) {
    console.error('[slack-bot] upload failed:', err instanceof Error ? err.message : err)
    return null
  }
  const done = await call('files.completeUploadExternal', { files: [{ id: fileId, title: filename }] })
  return done.ok ? fileId : null
}

export type Block = Record<string, unknown>

/**
 * Post a new message, or update the one at `ts`. A fresh upload can take a
 * moment before Slack will show it, so a refused image block is retried, then
 * sent without the photos rather than not at all. Returns the message ts.
 */
export async function postOrUpdate(
  { ts, text, blocks, imageBlocks }: { ts?: string | null; text: string; blocks: Block[]; imageBlocks: Block[] },
): Promise<string | null> {
  const channel = packagingChannel()
  const send = (withImages: boolean) => call(ts ? 'chat.update' : 'chat.postMessage', {
    channel, ...(ts ? { ts } : {}), text, unfurl_links: false,
    blocks: withImages ? [...blocks, ...imageBlocks] : blocks,
  })

  let res = await send(imageBlocks.length > 0)
  for (let i = 0; !res.ok && res.error === 'invalid_blocks' && imageBlocks.length && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    res = await send(true)
  }
  if (!res.ok && imageBlocks.length) res = await send(false)
  // The message was deleted in Slack: post it again
  if (!res.ok && ts && res.error === 'message_not_found') return postOrUpdate({ text, blocks, imageBlocks })
  return res.ok ? ((res.ts as string) ?? ts ?? null) : null
}
