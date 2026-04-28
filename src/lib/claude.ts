import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const VALID_IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function isPDF(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** For image or text files only — PDFs handled separately via beta API */
export async function fileToContent(
  file: File,
  prompt: string
): Promise<Anthropic.MessageParam['content']> {
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type || 'application/octet-stream'

  if (isImage(file)) {
    const imageType: ImageMediaType = VALID_IMAGE_TYPES.includes(mimeType as ImageMediaType)
      ? (mimeType as ImageMediaType)
      : 'image/jpeg'
    return [
      { type: 'text', text: prompt },
      { type: 'image', source: { type: 'base64', media_type: imageType, data: base64 } },
    ]
  }

  // CSV / plain text fallback
  const text = Buffer.from(bytes).toString('utf-8')
  return `${prompt}\n\n${text}`
}

/** Parse a PDF using streaming — required for large max_tokens responses */
export async function createMessageWithPDF(options: {
  model: string
  max_tokens: number
  system: string
  prompt: string
  pdfBase64: string
}): Promise<string> {
  const content: Anthropic.MessageParam['content'] = [
    { type: 'text', text: options.prompt },
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: options.pdfBase64 },
    } as Anthropic.DocumentBlockParam,
  ]

  const stream = anthropic.messages.stream({
    model: options.model,
    max_tokens: options.max_tokens,
    system: options.system,
    messages: [{ role: 'user', content }],
  })

  const response = await stream.finalMessage()

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Response truncated — try splitting the PDF into smaller sections.')
  }

  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

/** Create a message with streaming — required when max_tokens is large */
export async function createMessageStreamed(options: {
  model: string
  max_tokens: number
  system: string
  messages: Anthropic.MessageParam[]
}): Promise<string> {
  const stream = anthropic.messages.stream({
    model: options.model,
    max_tokens: options.max_tokens,
    system: options.system,
    messages: options.messages,
  })

  const response = await stream.finalMessage()

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Response truncated — try splitting the document into smaller sections.')
  }

  const block = response.content[0]
  return block.type === 'text' ? block.text : ''
}

/** Extract a JSON array from a Claude response (handles markdown code fences) */
export function extractJsonArray(text: string): unknown[] {
  const stripped = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
  const match = stripped.match(/\[[\s\S]*\]/)
  if (!match) return []
  return JSON.parse(match[0])
}

/** Extract a JSON object from a Claude response */
export function extractJsonObject(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('No JSON object found')
  return JSON.parse(match[0])
}
