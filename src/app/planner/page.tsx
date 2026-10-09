import { redirect } from 'next/navigation'
import { staffEmail } from '@/lib/planner/session'
import { PlannerView } from './PlannerView'

export const dynamic = 'force-dynamic'

export default async function PlannerPage() {
  const email = await staffEmail()
  if (!email) redirect('/login')
  return <PlannerView email={email} />
}
