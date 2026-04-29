import { getSettings } from './actions'
import { SettingsView } from './SettingsView'

export default async function SettingsPage() {
  const settings = await getSettings()

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="px-6 py-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Defaults and configuration for your brewery</p>
        </div>
        <SettingsView settings={settings} />
      </div>
    </main>
  )
}
