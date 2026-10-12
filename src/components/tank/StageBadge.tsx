import type { TankStage } from '@/types'
import { cn } from '@/lib/utils'
import { stageStyle } from '@/lib/stage-style'

interface StageBadgeProps {
  stage: TankStage
  className?: string
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  const s = stageStyle(stage)
  return (
    <span className={cn('inline-flex items-center gap-1.5 self-start rounded-full pl-2 pr-2.5 py-0.5 text-xs font-medium whitespace-nowrap', s.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}
