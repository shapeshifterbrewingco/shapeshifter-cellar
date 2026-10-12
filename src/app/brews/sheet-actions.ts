'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sanitiseSheet, sheetNumber } from '@/lib/brew-sheet'
import type { BrewSheetData, SheetReading } from '@/lib/brew-sheet'
import { logActivity, who, esc } from '@/lib/slack'

type Result = { ok: true } | { ok: false; message: string }
const fail = (message: string): Result => ({ ok: false, message })

/**
 * Save the brew day record. Called by the form's autosave, so it is quiet and
 * idempotent: the whole sheet is written each time.
 */
export async function saveBrewSheet(input: {
  brew_id: string
  data: BrewSheetData
  unchecked: string[]
  source?: 'app' | 'photo'
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and your changes will save.')

  const data = sanitiseSheet(input.data)
  const unchecked = (Array.isArray(input.unchecked) ? input.unchecked : [])
    .filter((p) => typeof p === 'string' && /^[a-z_.0-9]+$/.test(p)).slice(0, 200)

  const { data: brew } = await supabase
    .from('brews').select('id, beer_name, stage, og_plato, volume_l, deleted_at').eq('id', input.brew_id).maybeSingle()
  if (!brew) return fail('That brew no longer exists.')
  const { data: already } = await supabase.from('brew_sheets').select('brew_id, source').eq('brew_id', input.brew_id).maybeSingle()

  const row: Record<string, unknown> = {
    brew_id: input.brew_id, data, unchecked,
    updated_at: new Date().toISOString(), updated_by: user.email ?? user.id,
  }
  if (input.source) row.source = input.source
  const { error } = await supabase.from('brew_sheets').upsert(row, { onConflict: 'brew_id' })
  if (error) return fail(`Not saved: ${error.message}`)

  // Autosave runs constantly, so the log only hears about the two moments that
  // matter: a sheet being started, and one being read off a photo.
  if (input.source === 'photo' && already?.source !== 'photo') {
    logActivity(`${who(user.email)} read the paper brew sheet for *${esc(brew.beer_name)}* from a photo${unchecked.length ? `. ${unchecked.length} value${unchecked.length === 1 ? '' : 's'} still to check` : ''}.`)
  } else if (!already) {
    logActivity(`${who(user.email)} started the brew sheet for *${esc(brew.beer_name)}*.`)
  }

  // "All in FV" is where the tank card's OG and starting volume come from, so
  // the two never disagree. Volume only follows while the beer is still in its
  // first tank: after a transfer the card shows what arrived, not what was brewed.
  const og = sheetNumber(data.fv.plato)
  const volume = sheetNumber(data.fv.volume_l)
  const patch: Record<string, unknown> = {}
  if (og != null && og > 0 && og < 40 && Number(brew.og_plato) !== og) patch.og_plato = og
  if (volume != null && volume > 0 && volume < 20000 && brew.stage === 'active_ferment' && !brew.deleted_at && Number(brew.volume_l) !== volume) {
    patch.volume_l = volume
  }
  if (Object.keys(patch).length) {
    const { error: syncError } = await supabase.from('brews').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', input.brew_id)
    if (syncError) console.error('[saveBrewSheet] could not sync OG/volume to the brew:', syncError.message)
    else revalidatePath('/')
  }

  return { ok: true }
}

/**
 * Add ferment-log rows read off a paper sheet. Times are brewery-local. A row
 * that matches a reading already logged for this brew (same minute) is skipped,
 * so reading the same photo twice does not double the log.
 */
export async function importSheetReadings(input: {
  brew_id: string
  tank_id: string
  readings: SheetReading[]
}): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }

  const clean = (Array.isArray(input.readings) ? input.readings : [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date)))
    .slice(0, 80)
  if (!clean.length) return { ok: false, message: 'No readings with a usable date.' }

  const { data: existing } = await supabase
    .from('gravity_readings').select('recorded_at').eq('brew_id', input.brew_id)
  const have = new Set((existing ?? []).map((r) => new Date(r.recorded_at).toISOString().slice(0, 16)))

  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)
  const rows: Record<string, unknown>[] = []
  let skipped = 0
  for (const [i, r] of clean.entries()) {
    const time = /^\d{1,2}:\d{2}$/.test(r.time) ? r.time.padStart(5, '0') : '12:00'
    // A note under a reading shares its date; nudge it a minute later so it sorts beneath
    const at = adelaideInstant(r.date, time, r.plato == null && r.ph == null ? i % 50 : 0)
    if (!at) { skipped++; continue }
    const key = at.toISOString().slice(0, 16)
    if (have.has(key)) { skipped++; continue }
    have.add(key)
    rows.push({
      brew_id: input.brew_id, tank_id: input.tank_id, recorded_at: at.toISOString(),
      plato: num(r.plato, -5, 40), ph: num(r.ph, 0, 14), temperature_c: num(r.temp_c, -10, 110),
      notes: String(r.note ?? '').trim().slice(0, 300) || null,
      recorded_by: 'Brew sheet',
    })
  }
  if (!rows.length) return { ok: true, added: 0, skipped }

  const { error } = await supabase.from('gravity_readings').insert(rows)
  if (error) return { ok: false, message: `Readings not saved: ${error.message}` }

  revalidatePath('/')
  revalidatePath('/readings')
  return { ok: true, added: rows.length, skipped }
}

/** The instant a brewery wall-clock date and time happened. */
function adelaideInstant(date: string, time: string, plusMinutes: number): Date | null {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  if (hh > 23 || mm > 59) return null
  const wall = Date.UTC(y, m - 1, d, hh, mm + plusMinutes)
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(guess)).map((x) => [x.type, Number(x.value)]))
    guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  return Number.isNaN(guess) ? null : new Date(guess)
}
