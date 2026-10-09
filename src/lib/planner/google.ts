// Google Calendar + Sheets access for the production planner, as a service
// account. Share the Brewery Schedule calendar ("Make changes to events") and
// the Sales App + Packaging Splits sheets (Viewer) with the service account's
// email. Credentials: GOOGLE_SERVICE_ACCOUNT_JSON (the whole key file).

import { createSign } from 'crypto'

export const BREWERY_CALENDAR_ID =
  'c_b1cff5f4cc9e1080f3f97ff0b1d0545af9f11615c6be42d0460dfc1a84e51e5b@group.calendar.google.com'
export const SALES_SHEET_ID = process.env.SALES_SHEET_ID || '14E_iI8w91SYrH3sMcOetb1tr_UpH9Or2jOCbYR8laqg'
export const TZ = 'Australia/Adelaide'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].join(' ')

let cached: { token: string; exp: number } | null = null

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Google is not connected yet (no service account set up), so the calendar and sheets cannot be read')
  const key = JSON.parse(raw) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPES, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const jwt = `${header}.${claims}.${b64url(signer.sign(key.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`Google auth failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 }
  return cached.token
}

async function google(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.status === 204 ? null : res.json()
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Vercel runs in UTC. The Sales App logic reads dates with local getters, so
// "now" is built from Adelaide wall-clock parts and every date stays in that frame.

export function adelaideNow(): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  )
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute)
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

function adelaideDayOf(dateTime: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(dateTime)) // YYYY-MM-DD
}

// ── Calendar ────────────────────────────────────────────────────────────────

export interface CalEvent {
  id: string
  date: string        // YYYY-MM-DD, Adelaide
  endDate: string     // inclusive last day
  title: string
  description: string
  allDay: boolean
  time: string | null // HH:MM for timed events
  colorId: string | null
}

type RawEvent = {
  id: string; summary?: string; description?: string; colorId?: string; status?: string
  start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string }
}

function toCalEvent(e: RawEvent): CalEvent {
  const allDay = !!e.start.date
  const date = allDay ? e.start.date!.slice(0, 10) : adelaideDayOf(e.start.dateTime!)
  const endDate = allDay ? addDaysKey(e.end.date!.slice(0, 10), -1) : adelaideDayOf(e.end.dateTime!)
  const time = allDay ? null
    : new Intl.DateTimeFormat('en-AU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(e.start.dateTime!))
  return { id: e.id, date, endDate, title: e.summary || '(no title)', description: e.description || '', allDay, time, colorId: e.colorId || null }
}

/** Brewery Schedule events between two YYYY-MM-DD keys (inclusive). */
export async function listEvents(from: string, to: string): Promise<CalEvent[]> {
  const items: RawEvent[] = []
  let pageToken: string | undefined
  do {
    const qs = new URLSearchParams({
      // Pad a day each side (UTC vs Adelaide, ACST vs ACDT), then trim to the exact Adelaide dates
      timeMin: `${addDaysKey(from, -1)}T00:00:00Z`, timeMax: `${addDaysKey(to, 1)}T23:59:59Z`,
      singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    })
    const data = await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BREWERY_CALENDAR_ID)}/events?${qs}`)
    items.push(...(data.items || []).filter((e: RawEvent) => e.status !== 'cancelled'))
    pageToken = data.nextPageToken
  } while (pageToken)
  return items.map(toCalEvent).filter((e) => e.endDate >= from && e.date <= to)
}

export async function getEvent(id: string): Promise<CalEvent | null> {
  try {
    const e = await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BREWERY_CALENDAR_ID)}/events/${encodeURIComponent(id)}`)
    return e.status === 'cancelled' ? null : toCalEvent(e)
  } catch {
    return null
  }
}

/** All-day event (end date inclusive), shown as free time like the rest of the schedule. */
export async function createEvent(e: { date: string; endDate?: string; title: string; description?: string }) {
  const created = await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BREWERY_CALENDAR_ID)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: e.title,
      description: e.description || '',
      start: { date: e.date },
      end: { date: addDaysKey(e.endDate || e.date, 1) },
      transparency: 'transparent',
    }),
  })
  return toCalEvent(created)
}

export async function updateEvent(id: string, patch: { date?: string; endDate?: string; title?: string; description?: string }) {
  const body: Record<string, unknown> = {}
  if (patch.title !== undefined) body.summary = patch.title
  if (patch.description !== undefined) body.description = patch.description
  if (patch.date) {
    body.start = { date: patch.date }
    body.end = { date: addDaysKey(patch.endDate || patch.date, 1) }
  }
  const updated = await google(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BREWERY_CALENDAR_ID)}/events/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  return toCalEvent(updated)
}

export async function deleteEvent(id: string) {
  await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BREWERY_CALENDAR_ID)}/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Sheets ──────────────────────────────────────────────────────────────────

export async function sheetValues(spreadsheetId: string, range: string, opts: { unformatted?: boolean } = {}): Promise<unknown[][]> {
  const qs = opts.unformatted ? '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER' : ''
  const data = await google(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}${qs}`)
  return data.values || []
}

export async function sheetTabs(spreadsheetId: string): Promise<string[]> {
  const meta = await google(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`)
  return meta.sheets.map((s: { properties: { title: string } }) => s.properties.title)
}

export async function sheetBatch(spreadsheetId: string, ranges: string[]): Promise<unknown[][][]> {
  if (!ranges.length) return []
  const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
  const data = await google(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
  )
  return data.valueRanges.map((vr: { values?: unknown[][] }) => vr.values || [])
}
