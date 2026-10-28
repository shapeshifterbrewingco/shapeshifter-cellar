'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { setBatchCode } from './actions'

export function BatchForm({ brewId, initial }: { brewId: string; initial: string }) {
  const [code, setCode] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [pending, start] = useTransition()

  function save(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const res = await setBatchCode(brewId, code).catch(() => ({ ok: false, message: 'Could not reach the app.' }))
      if (!res.ok) { toast.error(res.message); return }
      setSaved(code.trim())
      toast.success(res.message)
    })
  }

  return (
    <form onSubmit={save} className="mt-5 rounded-2xl bg-white ring-1 ring-black/5 p-4 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Batch number</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus placeholder="e.g. 415"
          className="mt-1 w-full h-12 rounded-xl border border-gray-200 px-3 text-lg tabular-nums" />
      </label>
      <button type="submit" disabled={pending || code.trim() === saved}
        className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}{saved && code.trim() === saved ? 'Saved' : 'Save batch number'}
      </button>
    </form>
  )
}
