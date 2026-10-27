'use server'

import { after } from 'next/server'
import { writeSplitVolume } from '@/lib/tank-splits'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { sanitiseSheet, sheetNumber, sheetFromRecipe, withRecipeDefaults, recipeChanges, LIST_KEYS, spiritLitres } from '@/lib/brew-sheet'
import type { BrewSheetData, SheetReading } from '@/lib/brew-sheet'
import { logActivity, who, esc } from '@/lib/slack'
import { isRtd } from '@/lib/rtd'
import { updateBrewStage } from '@/app/brews/actions'

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
  /** The brewer tapped Finish brew day: put the All in FV figures onto the tank */
  finish?: boolean
}): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and your changes will save.')

  const data = sanitiseSheet(input.data)
  const unchecked = (Array.isArray(input.unchecked) ? input.unchecked : [])
    .filter((p) => typeof p === 'string' && /^[a-z_.0-9]+$/.test(p)).slice(0, 200)

  const { data: brew } = await supabase
    .from('brews').select('id, beer_name, style, tank_id, stage, og_plato, volume_l, deleted_at').eq('id', input.brew_id).maybeSingle()
  if (!brew) return fail('That brew no longer exists.')
  const { data: already } = await supabase.from('brew_sheets').select('brew_id, source, fv_volume:data->fv->>volume_l, dry_hops:data->dry_hops').eq('brew_id', input.brew_id).maybeSingle()

  const row: Record<string, unknown> = {
    brew_id: input.brew_id, data, unchecked,
    updated_at: new Date().toISOString(), updated_by: user.email ?? user.id,
  }
  if (input.source) row.source = input.source
  const { error } = await supabase.from('brew_sheets').upsert(row, { onConflict: 'brew_id' })
  if (error) return fail(`Not saved: ${error.message}`)

  // Autosave runs constantly, so the log only hears about a sheet being read
  // off a photo. Starting a sheet is already covered by assignBrew's
  // "started a brew day" message, which carries the tank and volume.
  if (input.source === 'photo' && already?.source !== 'photo') {
    logActivity(`${who(user.email)} read the paper brew sheet for *${esc(brew.beer_name)}* from a photo${unchecked.length ? `. ${unchecked.length} value${unchecked.length === 1 ? '' : 's'} still to check` : ''}.`)
  }

  // "All in FV" is where the tank card's OG and starting volume come from, so
  // the two never disagree. Volume only follows while the beer is still in its
  // first tank: after a transfer the card shows what arrived, not what was brewed.
  const og = sheetNumber(data.fv.plato)
  const base = sheetNumber(data.fv.volume_l)

  // Typing those figures does nothing to the tank on its own: autosave would
  // send a half-typed gravity. They land when the brewer taps Finish brew day.
  // After that, the sheet is the record, so a correction here corrects the tank.
  // A hard lemonade is made, not fermented: volume and temperature at the end,
  // no gravity or pH, and straight on chill.
  const rtd = isRtd(brew.beer_name, brew.style)
  // The spirit dosed into a lemonade is part of what the tank holds
  const withSpirit = (v: number | null, lines: Parameters<typeof spiritLitres>[0]) =>
    v != null && rtd ? Math.round((v + spiritLitres(lines)) * 10) / 10 : v
  const volume = withSpirit(base, data.dry_hops)
  const finished = brew.og_plato != null || brew.stage !== 'active_ferment'
  const tempIn = sheetNumber(data.fv.temp_c)
  if (input.finish) {
    if (finished) return fail('This brew day is already finished.')
    if (!(volume != null && volume > 0 && volume < 20000)) return fail('Enter the volume.')
    // A lemonade has no temperature to enter: it is read off the tank probe as the day is finished
    if (!rtd) {
      const phCheck = sheetNumber(data.fv.ph)
      if (!(og != null && og > 0 && og < 40)) return fail('Enter the gravity under All in FV.')
      if (!(phCheck != null && phCheck > 0 && phCheck <= 14)) return fail('Enter the pH under All in FV.')
    }
  } else if (!finished) {
    return { ok: true }
  }
  const patch: Record<string, unknown> = {}
  if (og != null && og > 0 && og < 40 && Number(brew.og_plato) !== og) patch.og_plato = og
  const firstTank = brew.stage === 'active_ferment' || (rtd && brew.stage === 'on_chill')
  // Once the brew day is finished the tank's volume has a life of its own (bottoms
  // come off). The sheet only moves it again when its own figure is corrected,
  // otherwise any later autosave would put the bottoms back.
  const before = already as { fv_volume?: string | null; dry_hops?: Parameters<typeof spiritLitres>[0] } | null
  const sheetVolumeChanged = input.finish || withSpirit(sheetNumber(before?.fv_volume ?? ''), before?.dry_hops) !== volume
  if (volume != null && volume > 0 && volume < 20000 && firstTank && !brew.deleted_at && sheetVolumeChanged && Number(brew.volume_l) !== volume) {
    patch.volume_l = volume
    // The Splits sheet plans off this number
    after(() => writeSplitVolume(input.brew_id).then(() => undefined))
  }
  // OG and pH together are the brew's first reading: the start of its ferment
  // chart. Written once both are in, and kept in step if either is corrected.
  const ph = sheetNumber(data.fv.ph)
  if (og != null && og > 0 && og < 40 && ph != null && ph > 0 && ph <= 14 && !brew.deleted_at) {
    const { data: first } = await supabase
      .from('gravity_readings').select('id, plato, ph').eq('brew_id', input.brew_id).eq('notes', 'Initial reading').maybeSingle()
    if (!first) {
      const { data: b } = await supabase.from('brews').select('tank_id').eq('id', input.brew_id).maybeSingle()
      const { error: readingError } = await supabase.from('gravity_readings').insert({
        brew_id: input.brew_id, tank_id: b?.tank_id, plato: og, ph,
        temperature_c: sheetNumber(data.fv.temp_c), recorded_by: user.email ?? user.id, notes: 'Initial reading',
      })
      if (readingError) console.error('[saveBrewSheet] initial reading failed:', readingError.message)
      else {
        logActivity(`${who(user.email)} finished the brew day for *${esc(brew.beer_name)}*: OG ${og}°P, pH ${ph}${volume != null ? `, ${volume} L in tank` : ''}.`)
        revalidatePath('/')
      }
    } else if (Number(first.plato) !== og || Number(first.ph) !== ph) {
      await supabase.from('gravity_readings').update({ plato: og, ph }).eq('id', first.id)
      revalidatePath('/')
    }
  }

  if (Object.keys(patch).length) {
    const { error: syncError } = await supabase.from('brews').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', input.brew_id)
    if (syncError) console.error('[saveBrewSheet] could not sync OG/volume to the brew:', syncError.message)
    else revalidatePath('/')
  }

  // The lemonade's finish: note what went in, and put it on chill
  if (input.finish && rtd) {
    const { error: noteError } = await supabase.from('gravity_readings').insert({
      brew_id: input.brew_id, tank_id: brew.tank_id, plato: null, ph: null, temperature_c: tempIn,
      recorded_by: user.email ?? user.id, notes: `Made: ${volume} L in tank${tempIn != null ? ` at ${tempIn}°C` : ''}`,
    })
    if (noteError) console.error('[saveBrewSheet] finish note failed:', noteError.message)
    logActivity(`${who(user.email)} finished *${esc(brew.beer_name)}*: ${volume} L in tank${tempIn != null ? ` at ${tempIn}°C` : ''}.`)
    await updateBrewStage(input.brew_id, brew.tank_id, 'on_chill')
    revalidatePath('/')
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

const STAGE_FOR: Record<string, string> = { malt: 'malt', mash_additions: 'mash_addition', kettle_additions: 'kettle_addition', kettle_hops: 'kettle_hop', dry_hops: 'dry_hop' }
const NOT_A_HOP = /aldc|enzyme|zinc|antifoam|hop ?aid|biofine|finings|nutrient|tetra|sorbate|spirit|puree|juice|sky ?farm/i

/**
 * Make what was brewed today the recipe for next time. The recipe keeps its
 * place (same name, same link from past brews) and its version number goes up
 * by one. Each line keeps its price-list link where the ingredient is unchanged.
 */
export async function applySheetToRecipe(brew_id: string): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You are signed out. Sign in again and retry.' }

  const { data: brew } = await supabase.from('brews').select('beer_name, recipe_id').eq('id', brew_id).maybeSingle()
  if (!brew?.recipe_id) return { ok: false, message: 'This brew was not started from a recipe.' }
  const [{ data: sheetRow }, { data: recipe }, { data: old }] = await Promise.all([
    supabase.from('brew_sheets').select('data').eq('brew_id', brew_id).maybeSingle(),
    supabase.from('recipes').select('id, name, version, boil_duration_min, mash_temp_c, pitch_temp_c, ferment_temp_c').eq('id', brew.recipe_id).maybeSingle(),
    supabase.from('recipe_ingredients')
      .select('recipe_id, name, category, addition_stage, quantity, unit, time_minutes, trigger, sort_order, ingredient_id')
      .eq('recipe_id', brew.recipe_id).order('sort_order'),
  ])
  if (!sheetRow || !recipe) return { ok: false, message: 'The brew sheet or its recipe could not be found.' }
  const sheet = sanitiseSheet(sheetRow.data)
  const before = old ?? []
  const changes = recipeChanges(withRecipeDefaults(sheetFromRecipe(before), recipe), sheet)
  if (!changes.length) return { ok: false, message: 'Nothing on the sheet differs from the recipe.' }

  const find = (name: string) => before.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase())
  const rows: Record<string, unknown>[] = []
  for (const key of LIST_KEYS) {
    for (const l of sheet[key]) {
      if (!l.name.trim()) continue
      const same = find(l.name)
      // A substitute takes the place of what it replaced: same step, same kind of ingredient
      const replaced = /^Substituted for (.+)$/.exec(l.note)?.[1]
      const like = same ?? (replaced ? find(replaced) : undefined)
      const stage = like?.addition_stage ?? (key === 'dry_hops' && NOT_A_HOP.test(l.name) ? 'process' : STAGE_FOR[key])
      const category = like?.category ?? (stage === 'malt' ? 'malt' : stage === 'kettle_hop' || stage === 'dry_hop' ? 'hop' : /calcium|gypsum/i.test(l.name) ? 'water_treatment' : 'other')
      const minutes = /^(\d+)\s*min/i.exec(l.when.trim())
      rows.push({
        recipe_id: recipe.id, name: l.name.trim(), category, addition_stage: stage,
        quantity: sheetNumber(l.amount), unit: l.unit.trim() || same?.unit || null,
        time_minutes: minutes ? Number(minutes[1]) : null,
        trigger: minutes ? null : l.when.trim() || null,
        // Only an unchanged ingredient keeps its price; a new one has to be linked on the recipe page
        ingredient_id: same?.ingredient_id ?? null,
      })
    }
  }
  if (sheet.yeast.strain.trim()) {
    const same = find(sheet.yeast.strain)
    const m = /^([\d.]+)\s*(kg|g|ml|l)$/i.exec(sheet.yeast.amount.trim())
    rows.push({
      recipe_id: recipe.id, name: sheet.yeast.strain.trim(), category: 'yeast', addition_stage: 'yeast',
      quantity: m ? Number(m[1]) : null, unit: m ? m[2].toLowerCase().replace('ml', 'mL').replace(/^l$/, 'L') : null,
      time_minutes: null, trigger: m ? null : sheet.yeast.amount.trim() || null, ingredient_id: same?.ingredient_id ?? null,
    })
  } else rows.push(...before.filter((o) => o.addition_stage === 'yeast'))
  // Lines the sheet has no place for (first wort hops and the like) carry over untouched
  rows.push(...before.filter((o) => o.addition_stage === 'mash_hop' && !rows.some((r) => r.name === o.name)))
  rows.forEach((r, i) => { r.sort_order = i })

  const { error: clearError } = await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id)
  if (clearError) return { ok: false, message: `Recipe not changed: ${clearError.message}` }
  const { error: insertError } = await supabase.from('recipe_ingredients').insert(rows)
  if (insertError) {
    if (before.length) await supabase.from('recipe_ingredients').insert(before)
    return { ok: false, message: `Recipe not changed: ${insertError.message}` }
  }

  const version = Number(recipe.version ?? 1) + 1
  const num = (v: string, fallback: number | null) => sheetNumber(v) ?? fallback
  const { error: recipeError } = await supabase.from('recipes').update({
    version,
    boil_duration_min: Math.round(num(sheet.kettle.boil_minutes, recipe.boil_duration_min) ?? 60),
    mash_temp_c: num(sheet.mash.target_temp_c, recipe.mash_temp_c),
    pitch_temp_c: num(sheet.yeast.pitch_temp_c, recipe.pitch_temp_c),
    ferment_temp_c: num(sheet.yeast.set_temp_c, recipe.ferment_temp_c),
    updated_at: new Date().toISOString(),
  }).eq('id', recipe.id)
  if (recipeError) console.error('[applySheetToRecipe] version not bumped:', recipeError.message)

  logActivity(`${who(user.email)} updated the *${esc(recipe.name)}* recipe to v${version} from today's brew:\n${changes.map((c) => `• ${esc(c)}`).join('\n')}`)
  revalidatePath('/recipes')
  revalidatePath(`/recipes/${recipe.id}`)
  return { ok: true, version }
}

/**
 * Tick a dry hop or cellar addition off (or back on) from the tank card. The
 * brew sheet is the record, so this writes to it, starting one from the recipe
 * if the brew does not have a sheet yet.
 */
export async function recordAddition(input: { brew_id: string; index: number; name: string; done: boolean }): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  const { data: brew } = await supabase.from('brews').select('id, beer_name, tank_id, recipe_id, deleted_at').eq('id', input.brew_id).maybeSingle()
  if (!brew || brew.deleted_at) return fail('That brew is no longer in tank.')
  const { data: row } = await supabase.from('brew_sheets').select('data, unchecked').eq('brew_id', input.brew_id).maybeSingle()

  let sheet = row ? sanitiseSheet(row.data) : null
  if (!sheet) {
    const { data: lines } = brew.recipe_id
      ? await supabase.from('recipe_ingredients').select('name, addition_stage, quantity, unit, time_minutes, trigger').eq('recipe_id', brew.recipe_id).order('sort_order')
      : { data: [] }
    sheet = sheetFromRecipe(lines ?? [])
  }
  const line = sheet.dry_hops[input.index]
  // The card may be a moment behind the sheet: the name has to match too
  if (!line || line.name.trim() !== input.name.trim()) return fail('That list has changed. Refresh and try again.')
  if (line.done === input.done) return { ok: true }

  const stamp = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Adelaide', day: 'numeric', month: 'short' }).format(new Date())
  sheet.dry_hops[input.index] = {
    ...line, done: input.done,
    note: input.done ? `Added ${stamp} by ${who(user.email)}` : line.note.replace(/^Added .* by .*$/, ''),
  }
  const { error } = await supabase.from('brew_sheets').upsert({
    brew_id: input.brew_id, data: sheet, unchecked: row?.unchecked ?? [],
    updated_at: new Date().toISOString(), updated_by: user.email ?? user.id,
  }, { onConflict: 'brew_id' })
  if (error) return fail(`Not saved: ${error.message}`)

  if (input.done) {
    const what = [line.name.trim(), [line.amount, line.unit].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    // On the ferment log too, so the chart shows when it went in
    const { error: noteError } = await supabase.from('gravity_readings').insert({
      brew_id: input.brew_id, tank_id: brew.tank_id, plato: null, ph: null,
      recorded_by: user.email ?? user.id, notes: `Added ${what}`,
    })
    if (noteError) console.error('[recordAddition] log note failed:', noteError.message)
    // No Slack message for additions: they are routine, and the log and the sheet already hold them
  }
  revalidatePath('/')
  return { ok: true }
}

/**
 * Call off a brew day that was started by mistake or as a test. The brew and
 * its sheet are removed and the tank goes back to empty. Only while the day is
 * still open: once it is finished the beer is real and has to be emptied
 * instead. Nothing is sent to Frigid, so the tank's set point is left alone.
 */
export async function cancelBrewDay(brew_id: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('You are signed out. Sign in again and retry.')

  const { data: brew } = await supabase
    .from('brews').select('id, beer_name, stage, og_plato, deleted_at, tanks(name)').eq('id', brew_id).maybeSingle()
  if (!brew) return fail('That brew no longer exists.')
  if (brew.deleted_at || brew.stage !== 'active_ferment' || brew.og_plato != null) {
    return fail('This brew day is already finished, so it cannot be cancelled. Use Empty for cleaning on the tank instead.')
  }

  // Stage history points at the brew and does not cascade; readings and the sheet do
  const { error: historyError } = await supabase.from('tank_stage_history').delete().eq('brew_id', brew_id)
  if (historyError) return fail(`Not cancelled: ${historyError.message}`)
  const { data: gone, error } = await supabase.from('brews').delete().eq('id', brew_id).select('id')
  if (error || !gone?.length) return fail(`Not cancelled: ${error?.message ?? 'the brew could not be removed'}`)

  const tank = (Array.isArray(brew.tanks) ? brew.tanks[0] : brew.tanks) as { name?: string } | null
  logActivity(`${who(user.email)} cancelled the brew day for *${esc(brew.beer_name)}*${tank?.name ? ` in ${tank.name}` : ''}. Nothing was brewed.`)
  revalidatePath('/')
  return { ok: true }
}
