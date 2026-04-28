import { cn } from '@/lib/utils'

interface TemperatureDotProps {
  recordedAt: string | null
}

export function TemperatureDot({ recordedAt }: TemperatureDotProps) {
  if (!recordedAt) return <span className="h-2 w-2 rounded-full bg-gray-700 inline-block" />

  const ageMinutes = (Date.now() - new Date(recordedAt).getTime()) / 60000

  const colour =
    ageMinutes < 2 ? 'bg-[#09434d]' :
    ageMinutes < 10 ? 'bg-amber-400' :
    'bg-red-500'

  return (
    <span
      className={cn('h-2 w-2 rounded-full inline-block', colour)}
      title={`Last reading: ${new Date(recordedAt).toLocaleTimeString()}`}
      suppressHydrationWarning
    />
  )
}
