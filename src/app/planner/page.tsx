import { redirect } from 'next/navigation'
import { staffEmail } from '@/lib/planner/session'
import { PlannerView } from './PlannerView'
import { getWeekStart } from '@/app/settings/actions'

export const dynamic = 'force-dynamic'

export default async function PlannerPage() {
  const email = await staffEmail()
  if (!email) redirect('/login')
  return <PlannerView email={email} weekStart={await getWeekStart()} />
}
