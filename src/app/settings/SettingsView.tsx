'use client'

import { useState, useTransition } from 'react'
import { Check, AlertCircle } from 'lucide-react'
import { updateSettings } from './actions'
import { HOP_LOAD_LABELS } from '@/types'
import type { AppSettings, HopLoad } from '@/types'

interface Props {
  settings: AppSettings
}

interface Section {
  title: string
  description: string
}

function SectionHeader({ title, description }: Section) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-black text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{description}</p>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function TempInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="0.5"
        min="-20"
        max="100"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-sm text-gray-500 font-medium">°C</span>
    </div>
  )
}

function WeeksInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        step="1"
        min="1"
        max="52"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-sm text-gray-500 font-medium">weeks</span>
    </div>
  )
}

function RateInput({ value, onChange, unit = '$/LaL', step = '0.01' }: { value: string; onChange: (v: string) => void; unit?: string; step?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-500 font-medium">$</span>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <span className="text-sm text-gray-500 font-medium">{unit}</span>
    </div>
  )
}

export function SettingsView({ settings }: Props) {
  const [diacTemp, setDiacTemp] = useState(String(settings.diacetyl_rest_temp_c))
  const [chillTemp, setChillTemp] = useState(String(settings.on_chill_temp_c))
  const [aleWeeks, setAleWeeks] = useState(String(settings.ale_weeks))
  const [lagerWeeks, setLagerWeeks] = useState(String(settings.lager_weeks))
  const [hopLoad, setHopLoad] = useState<HopLoad>(settings.default_hop_load)
  const [defaultVolume, setDefaultVolume] = useState(settings.default_brew_volume_l != null ? String(settings.default_brew_volume_l) : '')
  // Excise rates
  const [canStd, setCanStd] = useState(String(settings.excise_rate_can_std))
  const [kegStd, setKegStd] = useState(String(settings.excise_rate_keg_std))
  const [rtd, setRtd] = useState(String(settings.excise_rate_rtd))
  const [kegMid, setKegMid] = useState(String(settings.excise_rate_keg_mid))
  // SA Canning rates
  const [canningPerL, setCanningPerL] = useState(String(settings.sa_canning_rate_per_l ?? 0.99))
  const [canningPerEnd, setCanningPerEnd] = useState(String(settings.sa_canning_rate_per_end ?? 0.069))
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    const parsed = {
      diacetyl_rest_temp_c: parseFloat(diacTemp) || 21,
      on_chill_temp_c: parseFloat(chillTemp) || 2,
      ale_weeks: parseInt(aleWeeks) || 4,
      lager_weeks: parseInt(lagerWeeks) || 6,
      default_hop_load: hopLoad,
      default_brew_volume_l: defaultVolume !== '' ? parseFloat(defaultVolume) : null,
      excise_rate_can_std: parseFloat(canStd) || 63.75,
      excise_rate_keg_std: parseFloat(kegStd) || 43.39,
      excise_rate_rtd: parseFloat(rtd) || 107.99,
      excise_rate_keg_mid: parseFloat(kegMid) || 33.11,
      sa_canning_rate_per_l: parseFloat(canningPerL) || 0.99,
      sa_canning_rate_per_end: parseFloat(canningPerEnd) || 0.069,
    }
    startTransition(async () => {
      await updateSettings(parsed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  return (
    <div className="max-w-xl space-y-8">

      {/* Fermentation */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
        <SectionHeader
          title="Fermentation"
          description="Default temperatures used when moving a brew through stages."
        />
        <Field label="Diacetyl rest temp" hint="Setpoint applied when moving to Diacetyl Rest">
          <TempInput value={diacTemp} onChange={setDiacTemp} />
        </Field>
        <Field label="On chill temp" hint="Setpoint applied when moving to On Chill">
          <TempInput value={chillTemp} onChange={setChillTemp} />
        </Field>
      </div>

      {/* Scheduling */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
        <SectionHeader
          title="Scheduling"
          description="Used to auto-calculate transfer and pack dates when scheduling a brew."
        />
        <Field label="Ale duration" hint="Weeks from brew day to pack date">
          <WeeksInput value={aleWeeks} onChange={setAleWeeks} />
        </Field>
        <Field label="Lager duration" hint="Weeks from brew day to pack date">
          <WeeksInput value={lagerWeeks} onChange={setLagerWeeks} />
        </Field>
      </div>

      {/* Packaging */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
        <SectionHeader
          title="Packaging"
          description="Defaults used in the packaging split calculator."
        />
        <Field label="Default hop load" hint="Pre-selected hop load when opening the splits modal">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            {(['low', 'medium', 'high'] as HopLoad[]).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setHopLoad(l)}
                className={`px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  hopLoad === l
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {HOP_LOAD_LABELS[l]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Default brew volume" hint="Pre-filled volume when assigning a new brew (optional)">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="50"
              min="0"
              max="10000"
              value={defaultVolume}
              onChange={e => setDefaultVolume(e.target.value)}
              placeholder="—"
              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-bold text-gray-900 text-right focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-sm text-gray-500 font-medium">L</span>
          </div>
        </Field>
      </div>

      {/* Excise & Canning */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
        <SectionHeader
          title="Excise & Canning"
          description="Australian excise duty rates and SA Canning contract costs used in the packaging split calculator."
        />
        <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Excise rates are indexed by the ATO every 6 months (February and August). Update these after each rate change.
          </p>
        </div>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Excise duty ($/LaL)</p>
        <Field label="Standard can" hint="Beer in cans/bottles ≥ 3.5% ABV">
          <RateInput value={canStd} onChange={setCanStd} />
        </Field>
        <Field label="Standard keg" hint="Beer in kegs ≥ 3.5% ABV">
          <RateInput value={kegStd} onChange={setKegStd} />
        </Field>
        <Field label="Mid-strength keg" hint="Beer in kegs 1.15–3.5% ABV">
          <RateInput value={kegMid} onChange={setKegMid} />
        </Field>
        <Field label="RTD" hint="Ready-to-drink / spirit-based products">
          <RateInput value={rtd} onChange={setRtd} />
        </Field>
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2 mt-4">SA Canning contract costs</p>
        <Field label="Fill rate" hint="Cost per litre of beer filled">
          <RateInput value={canningPerL} onChange={setCanningPerL} unit="/L" step="0.001" />
        </Field>
        <Field label="End / lid rate" hint="Cost per lid (seamed end) per can">
          <RateInput value={canningPerEnd} onChange={setCanningPerEnd} unit="/end" step="0.001" />
        </Field>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="bg-primary text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? 'Saving…' : 'Save settings'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  )
}
