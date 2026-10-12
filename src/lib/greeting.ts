// The line at the top of the Cellar page. Worked out from the brewery's clock,
// not the server's, so it is right whatever machine renders it.

const TZ = 'Australia/Adelaide'

function breweryClock(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  )
  return { day: p.weekday as string, hour: Number(p.hour) }
}

/**
 * @param name     First name, or '' if unknown
 * @param brewDay  True when a brew is booked for today
 */
export function greeting(name: string, opts: { brewDay?: boolean; now?: Date } = {}): string {
  const { day, hour } = breweryClock(opts.now ?? new Date())
  const to = name ? `, ${name}` : ''
  const weekend = day === 'Saturday' || day === 'Sunday'

  // The ones worth opening the app for
  if (day === 'Friday' && hour >= 17) return `It's beer o'clock${to}`
  if (day === 'Friday' && hour >= 14) return `Almost beer o'clock${to}`
  if (hour < 5) return `The yeast never sleeps, but you should${to}`
  if (hour >= 22) return `Burning the midnight oil${to}?`
  if (weekend) return hour < 12 ? `It's ${day}${to}. The tanks will keep` : `Checking in on a ${day}${to}?`
  if (opts.brewDay && hour < 12) return `Happy brew day${to}`
  if (day === 'Monday' && hour < 12) return `Good morning${to}. Fresh week, fresh wort`

  if (hour < 12) return `Good morning${to}`
  if (hour < 17) return `Good afternoon${to}`
  return `Good evening${to}`
}
