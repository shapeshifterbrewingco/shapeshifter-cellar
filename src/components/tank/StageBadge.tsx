import type { TankStage } from '@/types'
import { cn } from '@/lib/utils'
import { stageStyle, IN_PRODUCTION } from '@/lib/stage-style'

interface StageBadgeProps {
  stage: TankStage
  className?: string
  /** A brew day still running: shown as In production, not as its stage */
  inProduction?: boolean
}

export function StageBadge({ stage, className, inProduction }: StageBadgeProps) {
  const s = inProduction ? IN_PRODUCTION : stageStyle(stage)
  return (
    <span className={cn('inline-flex items-center gap-1.5 self-start rounded-full pl-2 pr-2.5 py-0.5 text-xs font-medium whitespace-nowrap', s.pill, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}
