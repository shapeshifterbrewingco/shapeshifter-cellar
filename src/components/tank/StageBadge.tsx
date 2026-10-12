import type { TankStage } from '@/types'
import { cn } from '@/lib/utils'

const STAGE_STYLES: Record<TankStage, string> = {
  empty: 'bg-gray-100 text-gray-500',
  cleaning: 'bg-gray-100 text-gray-600',
  filled: 'bg-gray-100 text-gray-600',
  active_ferment: 'bg-amber-50 text-amber-700',
  diacetyl_rest: 'bg-violet-50 text-violet-700',
  vdk_pass: 'bg-orange-50 text-orange-700',
  on_chill: 'bg-sky-50 text-sky-700',
  ready: 'bg-emerald-50 text-emerald-700',
  transferred: 'bg-gray-100 text-gray-600',
  packaged: 'bg-gray-100 text-gray-500',
}

const STAGE_DOT: Partial<Record<TankStage, string>> = {
  active_ferment: 'bg-amber-400',
  diacetyl_rest: 'bg-violet-400',
  vdk_pass: 'bg-orange-400',
  on_chill: 'bg-sky-500',
  ready: 'bg-emerald-500',
}

const STAGE_SHORT: Record<TankStage, string> = {
  empty: 'Empty',
  cleaning: 'Cleaning',
  filled: 'Filled',
  active_ferment: 'Fermenting',
  diacetyl_rest: 'Diacetyl rest',
  vdk_pass: 'VDK pass',
  on_chill: 'On chill',
  ready: 'Ready',
  transferred: 'Transferred',
  packaged: 'Packaged',
}

interface StageBadgeProps {
  stage: TankStage
  className?: string
}

// Stage is the one place colour is used on a tank, so it reads at a glance
export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 self-start rounded-full pl-2 pr-2.5 py-0.5 text-xs font-medium whitespace-nowrap', STAGE_STYLES[stage], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_DOT[stage] ?? 'bg-gray-400')} />
      {STAGE_SHORT[stage]}
    </span>
  )
}
