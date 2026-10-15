'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, X } from 'lucide-react'
import { getPackPhotos } from '@/app/history/actions'
import { shrinkPhoto, uploadPackPhoto } from '@/lib/shrink-photo'

type Photo = { id: string; url: string | null }

const MAX = 6
const THUMB = 'relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 ring-1 ring-black/5'

/**
 * A batch's packaging photos in History. Adding or removing one saves straight
 * away and updates the report's post in #packagingreports.
 */
export function PackPhotos({ brewId }: { brewId: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    getPackPhotos(brewId).then((p) => { if (live) setPhotos(p) }).catch(() => { if (live) setPhotos([]) })
    return () => { live = false }
  }, [brewId])

  async function add(files: FileList | null) {
    if (!files?.length || busy) return
    setBusy(true)
    try {
      for (const f of [...files].slice(0, MAX - (photos?.length ?? 0))) {
        const added = await uploadPackPhoto(brewId, await shrinkPhoto(f, 1600), true)
        setPhotos((p) => [...(p ?? []), added])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The photo did not upload.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this photo? It also comes off the Slack post.')) return
    const res = await fetch(`/api/pack-photo?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('The photo was not removed.'); return }
    setPhotos((p) => (p ?? []).filter((x) => x.id !== id))
  }

  if (photos == null) return null
  return (
    <section>
      <h3 className="text-xs font-semibold text-gray-500 mb-1.5">Photos</h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <div key={p.id} className={THUMB}>
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={p.url} alt="Packaging photo" className="h-full w-full object-cover" />
              </a>
            )}
            <button type="button" onClick={() => void remove(p.id)} aria-label="Remove photo"
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < MAX && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className={`${THUMB} flex flex-col items-center justify-center gap-1 text-primary text-[11px] font-semibold disabled:opacity-60`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {busy ? 'Uploading' : 'Add photo'}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
    </section>
  )
}
