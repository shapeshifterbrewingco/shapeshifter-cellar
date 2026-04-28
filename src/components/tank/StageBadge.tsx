import { Badge } from '@/components/ui/badge'
import type { TankStage } from '@/types'
import { cn } from '@/lib/utils'

const STAGE_STYLES: Record<TankStage, string> = {
  empty: 'bg-gray-100 text-gray-500 border-gray-200',
  cleaning: 'bg-blue-50 text-blue-600 border-blue-200',
  filled: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  active_ferment: 'bg-[#09434d]/10 text-[#09434d] border-[#09434d]/20',
  diacetyl_rest: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  vdk_pass: 'bg-orange-50 text-orange-700 border-orange-200',
  on_chill: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  ready: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  transferred: 'bg-purple-50 text-purple-600 border-purple-200',
  packaged: 'bg-gray-100 text-gray-500 border-gray-200',
}

const STAGE_SHORT: Record<TankStage, string> = {
  empty: 'Empty',
  cleaning: 'Cleaning',
  filled: 'Filled',
  active_ferment: 'Fermenting',
  diacetyl_rest: 'Diacetyl Rest',
  vdk_pass: 'VDK Pass',
  on_chill: 'On Chill',
  ready: 'Ready',
  transferred: 'Transferred',
  packaged: 'Packaged',
}

interface StageBadgeProps {
  stage: TankStage
  className?: string
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-semibold px-2 py-0.5 border whitespace-nowrap', STAGE_STYLES[stage], className)}
    >
      {STAGE_SHORT[stage]}
    </Badge>
  )
}
