// The line at the top of the Cellar page. Worked out from the brewery's clock,
// not the server's, so it is right whatever machine renders it.

const TZ = 'Australia/Adelaide'

function breweryClock(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', hour: 'numeric', hourCycle: 'h23', month: '2-digit', day: '2-digit' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  )
  return { day: p.weekday as string, hour: Number(p.hour), monthDay: `${p.month}-${p.day}` }
}

/** The days that get their own line all day. Null on an ordinary day. */
export function specialGreeting(name: string, opts: { birthday?: string | null; now?: Date } = {}): string | null {
  const { monthDay } = breweryClock(opts.now ?? new Date())
  const to = name ? `, ${name}` : ''
  if (opts.birthday && opts.birthday === monthDay) return `Happy birthday${to}`
  if (monthDay === '12-21') return `Happy Gravy Day${to}`
  if (monthDay === '12-25') return `Merry Christmas${to}`
  return null
}

// Shown at random, roughly one app open in six. {name} is dropped cleanly when unknown.
const EGGS = [
  'Hey big dog',
  'How good are lagers{name}',
  'Trust the process{name}. And the Anton Paar',
  'Another day, another dry hop',
  'Smells like brew day{name}',
  'You are doing great{name}. Untappd said so',
]

// Ones written for one person. They join the pool only for that name.
const PERSONAL_EGGS: Record<string, string[]> = {
  carla: ['Girls just wanna mash tun, Carla'],
}

/** An easter egg greeting, or null most of the time. */
export function easterEgg(name: string, chance = 1 / 6): string | null {
  if (Math.random() >= chance) return null
  const pool = [...EGGS, ...(PERSONAL_EGGS[name.toLowerCase()] ?? [])]
  const pick = pool[Math.floor(Math.random() * pool.length)]
  return pick.replace('{name}', name ? `, ${name}` : '')
}

/**
 * @param name     First name, or '' if unknown
 * @param brewDay  True when a brew is booked for today
 */
export function greeting(name: string, opts: { brewDay?: boolean; birthday?: string | null; now?: Date } = {}): string {
  const special = specialGreeting(name, opts)
  if (special) return special
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
