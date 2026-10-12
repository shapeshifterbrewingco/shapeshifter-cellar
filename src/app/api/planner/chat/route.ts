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

// Each step re-sends the whole conversation, calendar and forecast results
// included. Marking the last block lets the next step read all of it from the
// cache at a tenth of the price instead of paying for it again.
function withCacheMark(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (!messages.length) return messages
  const last = messages[messages.length - 1]
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content]
  if (!blocks.length) return messages
  const tail = blocks[blocks.length - 1]
  if (tail.type === 'thinking' || tail.type === 'redacted_thinking') return messages
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' } } as Anthropic.ContentBlockParam
  return [...messages.slice(0, -1), { ...last, content: blocks }]
}

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
        let finished = false
        for (let step = 0; step < MAX_STEPS; step++) {
          const s = anthropic.messages.stream({ model: MODEL, max_tokens: 8000, system, tools, messages: withCacheMark(messages) })
          s.on('text', (delta) => send({ type: 'text', delta }))
          const msg = await s.finalMessage()
          if (msg.stop_reason !== 'tool_use') {
            // Cut off mid tool call: keep the words, drop the unanswered call, or
            // the next message would be rejected for a tool call with no result
            const content = msg.content.filter((b) => b.type !== 'tool_use')
            if (content.length !== msg.content.length || msg.stop_reason === 'max_tokens') {
              const note = '\n\n(That reply ran out of room before it finished. Ask me to continue.)'
              send({ type: 'text', delta: note })
              content.push({ type: 'text', text: note, citations: null })
            }
            messages.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: '(no reply)' }] })
            finished = true
            break
          }
          messages.push({ role: 'assistant', content: msg.content })

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
        if (!finished) {
          // Out of steps with tool results still unanswered. Close the turn so
          // the conversation stays usable.
          const note = `I stopped after ${MAX_STEPS} look-ups without finishing. Ask again with a narrower question.`
          send({ type: 'text', delta: note })
          messages.push({ role: 'assistant', content: [{ type: 'text', text: note }] })
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
