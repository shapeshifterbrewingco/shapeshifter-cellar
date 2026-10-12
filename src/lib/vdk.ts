import type { VdkResult } from '@/types'

/** How each VDK result looks, wherever it is shown. */
export const VDK_STYLE: Record<VdkResult, { label: string; bg: string; text: string; border: string }> = {
  high:   { label: 'High',   bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200' },
  medium: { label: 'Medium', bg: 'bg-malt/15',  text: 'text-malt-dark', border: 'border-malt/40' },
  low:    { label: 'Low',    bg: 'bg-yeast/30', text: 'text-charcoal',  border: 'border-yeast' },
  pass:   { label: 'Pass',   bg: 'bg-water/40', text: 'text-hops',      border: 'border-water' },
}

export const vdkLabel = (r: string) => VDK_STYLE[r as VdkResult]?.label ?? r

interface VdkRow { id: string; recorded_at: string; result: string; recorded_by: string; notes: string | null }
interface ReadingRow { id: string; recorded_at: string; plato: number | null; ph: number | null; recorded_by: string; notes: string | null }

/**
 * A brew's readings with its VDK results slotted in by time, oldest first.
 * A VDK row carries no gravity or pH; `vdk` holds the result so a list can
 * draw it as a pill.
 */
export function withVdk<R extends ReadingRow>(readings: R[], vdk: VdkRow[] | undefined): (R & { vdk?: VdkResult })[] {
  const rows: (R & { vdk?: VdkResult })[] = [...readings]
  for (const v of vdk ?? []) {
    rows.push({
      id: `vdk-${v.id}`, recorded_at: v.recorded_at, plato: null, ph: null,
      recorded_by: v.recorded_by, notes: v.notes, vdk: v.result as VdkResult,
    } as unknown as R & { vdk?: VdkResult })
  }
  return rows.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
}
