export interface FrigidReading {
  name: string
  tank: string
  temperature: number | null
  setPoint: number | null
  lastTemperatureReading: string | null
  history: { recorded_at: string; temperature_c: number }[]
  tankId: string | null
}

const UTILITY_TANK_NAMES = ['HLT', 'CLT', 'Glycol']

// Frigid reports 200 as the set point of a tank with cooling switched off
export const FRIGID_OFF_SET_POINT = 200

const toNumber = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Live readings for every vessel Frigid knows about. Fails soft to an empty list. */
export async function getFrigidReadings(): Promise<FrigidReading[]> {
  const apiKey = process.env.FRIGID_API_KEY
  const apiUrl = process.env.FRIGID_API_URL
  if (!apiKey || !apiUrl) return []

  try {
    const res = await fetch(`${apiUrl}/batch/list?includeInactiveTanks=1`, {
      headers: { 'x-api-key': apiKey },
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.error('[frigid] batch/list returned', res.status)
      return []
    }

    const data: unknown = await res.json()
    if (!Array.isArray(data)) return []
    return data
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).tank === 'string'
      )
      .map((item) => ({
        name: item.tank as string,
        tank: item.tank as string,
        temperature: toNumber(item.temperature),
        setPoint: toNumber(item.setPoint),
        lastTemperatureReading: typeof item.lastTemperatureReading === 'string' ? item.lastTemperatureReading : null,
        history: [],
        tankId: null,
      }))
  } catch (err) {
    console.error('[frigid] batch/list failed:', err instanceof Error ? err.message : err)
    return []
  }
}

export function utilityReadings(all: FrigidReading[]): FrigidReading[] {
  return all
    .filter((r) => UTILITY_TANK_NAMES.includes(r.name))
    .sort((a, b) => UTILITY_TANK_NAMES.indexOf(a.name) - UTILITY_TANK_NAMES.indexOf(b.name))
}
