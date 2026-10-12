import { format, isToday, parseISO } from 'date-fns'

/** Day a reading was logged: "Today" for today, otherwise "12 Oct". */
export function logDay(iso: string, pattern = 'd MMM'): string {
  const d = parseISO(iso)
  return isToday(d) ? 'Today' : format(d, pattern)
}

/** Day and time a reading was logged: "Today 14:05" or "12 Oct 14:05". */
export function logDayTime(iso: string, sep = ' ', pattern = 'd MMM'): string {
  return `${logDay(iso, pattern)}${sep}${format(parseISO(iso), 'HH:mm')}`
}
