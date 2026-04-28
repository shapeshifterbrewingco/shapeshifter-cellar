'use server'

import { createClient } from '@/lib/supabase/server'
import { getPackagingReport } from '@/lib/reports'
import type { ReportPeriod, PackagingReportData } from '@/lib/reports'

export async function getPackagingReportAction(period: ReportPeriod): Promise<PackagingReportData> {
  const supabase = await createClient()
  return getPackagingReport(supabase, period)
}
