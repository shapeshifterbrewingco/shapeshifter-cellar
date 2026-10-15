// Phone photos are 3-12 MB. Shrunk in the browser to a JPEG data URL before
// they are sent anywhere, which keeps uploads quick on the brewery's signal.

export async function shrinkPhoto(file: File, maxSide = 2200, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('That file is not a photo the app can open.'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Send one shrunk photo to a batch. `publish` updates its Slack post straight away. */
export async function uploadPackPhoto(brewId: string, image: string, publish: boolean): Promise<{ id: string; url: string | null }> {
  const res = await fetch('/api/pack-photo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brew_id: brewId, image, publish }),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'The photo did not upload.')
  return out
}
