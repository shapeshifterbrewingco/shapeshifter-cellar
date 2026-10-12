// Calendar-date helpers. The brewery runs on Adelaide time, the server runs on
// UTC, and toISOString() always answers in UTC, so a date built from it is a
// day behind until 10:30am. Everything that needs "today" or date arithmetic
// goes through here.

export const BREWERY_TZ = 'Australia/Adelaide'

function zonedParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BREWERY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date at the brewery as YYYY-MM-DD, whatever timezone the code runs in. */
export function breweryToday(now = new Date()): string {
  const p = zonedParts(now)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** Brewery-local year and zero-indexed month for a moment in time. */
export function breweryYearMonth(now = new Date()): { year: number; month: number } {
  const p = zonedParts(now)
  return { year: p.y, month: p.m - 1 }
}

/** Add days to a YYYY-MM-DD string. Pure calendar maths, no timezone involved. */
export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD string. */
export function weekdayISO(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

/** Transfer day for a pack date: three days before, pulled back to Friday if that lands on a weekend. */
export function transferDateFor(packDate: string): string {
  let d = addDaysISO(packDate, -3)
  const dow = weekdayISO(d)
  if (dow === 6) d = addDaysISO(d, -1)
  else if (dow === 0) d = addDaysISO(d, -2)
  return d
}

/** Whole days from one YYYY-MM-DD date to another. */
export function daysBetweenISO(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** The instant a brewery-local wall-clock time happens. month is zero-indexed. */
export function breweryInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const wall = Date.UTC(year, month, day, hour, minute, second)
  // Two passes so the offset is the one in force at the target time, not at the
  // first guess (they differ on the two daylight-saving changeover days).
  let guess = wall
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess))
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s)
    guess += wall - shown
  }
  return new Date(guess)
}
