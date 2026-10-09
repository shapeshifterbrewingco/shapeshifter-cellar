// Planner chat. Runs Claude with the planner tools and streams back
// newline-delimited JSON events:
//   {type:'text', delta}       assistant text as it is written
//   {type:'tool', name}        a tool is running
//   {type:'plan', plan}        a plan card to show (not applied)
//   {type:'done', messages}    the full conversation, for the next turn
//   {type:'error', message}

import type Anthropic from '@anthropic-ai/sdk'
import { anthropic } from '@/lib/claude'
import { adelaideNow } from '@/lib/planner/google'
import { systemPrompt } from '@/lib/planner/prompt'
import { TOOLS, runTool } from '@/lib/planner/tools'
import { staffEmail } from '@/lib/planner/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL = process.env.PLANNER_MODEL || 'claude-sonnet-5'
const MAX_STEPS = 15

export async function POST(request: Request) {
  const email = await staffEmail()
  if (!email) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { messages: incoming } = (await request.json()) as { messages: Anthropic.MessageParam[] }
  if (!Array.isArray(incoming) || !incoming.length) return Response.json({ error: 'No messages' }, { status: 400 })

  const today = adelaideNow()
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: systemPrompt(today, email), cache_control: { type: 'ephemeral' } },
  ]
  const tools = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' as const } } : t))
  const messages = [...incoming]

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const s = anthropic.messages.stream({ model: MODEL, max_tokens: 8000, system, tools, messages })
          s.on('text', (delta) => send({ type: 'text', delta }))
          const msg = await s.finalMessage()
          messages.push({ role: 'assistant', content: msg.content })
          if (msg.stop_reason !== 'tool_use') break

          const results: Anthropic.ToolResultBlockParam[] = []
          for (const block of msg.content) {
            if (block.type !== 'tool_use') continue
            send({ type: 'tool', name: block.name })
            try {
              const { result, plan } = await runTool(block.name, block.input as Record<string, unknown>, today)
              if (plan) send({ type: 'plan', plan })
              results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
            } catch (e) {
              results.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${(e as Error).message}`, is_error: true })
            }
          }
          messages.push({ role: 'user', content: results })
          send({ type: 'text', delta: '\n\n' })
        }
        send({ type: 'done', messages })
      } catch (e) {
        send({ type: 'error', message: (e as Error).message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
