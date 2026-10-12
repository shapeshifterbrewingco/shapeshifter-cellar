import { getSettings, getWeekStart, getBirthday } from './actions'
import { MyPreferences } from './MyPreferences'
import { createClient } from '@/lib/supabase/server'
import { formatUserName } from '@/lib/utils'
import { SettingsView } from './SettingsView'

export default async function SettingsPage() {
  const supabase = await createClient()
  const [settings, weekStart, birthday, { data: { user } }] = await Promise.all([getSettings(), getWeekStart(), getBirthday(), supabase.auth.getUser()])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Defaults and configuration for your brewery</p>
        </div>
        <MyPreferences weekStart={weekStart} birthday={birthday} name={formatUserName(user?.email ?? '')} />
        <SettingsView settings={settings} />
      </div>
    </main>
  )
}
