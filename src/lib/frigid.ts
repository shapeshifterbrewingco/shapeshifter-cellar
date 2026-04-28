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

export async function getUtilityTemps(): Promise<FrigidReading[]> {
  const apiKey = process.env.FRIGID_API_KEY
  const apiUrl = process.env.FRIGID_API_URL
  if (!apiKey || !apiUrl) return []

  try {
    const res = await fetch(`${apiUrl}/batch/list?includeInactiveTanks=1`, {
      headers: { 'x-api-key': apiKey },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const data: unknown[] = await res.json()
    return data
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && 'tank' in item
      )
      .filter((item) => UTILITY_TANK_NAMES.includes(item.tank as string))
      .map((item) => ({
        name: (item.tank as string),
        tank: (item.tank as string),
        temperature: typeof item.temperature === 'number'
          ? item.temperature
          : typeof item.temperature === 'string' ? parseFloat(item.temperature as string) : null,
        setPoint: typeof item.setPoint === 'number'
          ? item.setPoint
          : typeof item.setPoint === 'string' ? parseFloat(item.setPoint as string) : null,
        lastTemperatureReading: typeof item.lastTemperatureReading === 'string' ? item.lastTemperatureReading : null,
        history: [],
        tankId: null,
      }))
      .sort((a, b) => UTILITY_TANK_NAMES.indexOf(a.name) - UTILITY_TANK_NAMES.indexOf(b.name))
  } catch {
    return []
  }
}
