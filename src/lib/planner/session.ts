import { createClient } from '@/lib/supabase/server'
import { isStaffEmail } from '@/lib/auth-domain'

/** The signed-in staff member's email, or null. Every planner route checks this. */
export async function staffEmail(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return isStaffEmail(user?.email) ? user!.email!.toLowerCase() : null
}
