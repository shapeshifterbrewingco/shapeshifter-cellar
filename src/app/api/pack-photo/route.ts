// Photos for a packaging report: one per request, sent as a shrunk JPEG data
// URL. Kept in a private bucket and shown through short-lived signed URLs.
// Adding or removing one refreshes the report's post in #packagingreports.

import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, publishPackReportLater } from '@/lib/pack-report-post'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 4_000_000
const MAX_PHOTOS = 6

/** The signed-in brewer or admin, or null */
async function brewer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return data?.role === 'admin' || data?.role === 'brewer' ? user : null
}

export async function POST(req: Request) {
  const user = await brewer()
  if (!user) return NextResponse.json({ error: 'Only brewers can add photos.' }, { status: 403 })

  const { brew_id, image, publish } = await req.json().catch(() => ({})) as { brew_id?: string; image?: string; publish?: boolean }
  const m = typeof image === 'string' ? image.match(/^data:image\/jpeg;base64,(.+)$/) : null
  if (!brew_id || !m) return NextResponse.json({ error: 'Send a brew and a JPEG photo.' }, { status: 400 })
  const bytes = Buffer.from(m[1], 'base64')
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'That photo is too large.' }, { status: 413 })

  const db = createServiceClient()
  const { data: brew } = await db.from('brews').select('id').eq('id', brew_id).maybeSingle()
  if (!brew) return NextResponse.json({ error: 'That batch was not found.' }, { status: 404 })
  const { count } = await db.from('pack_photos').select('id', { count: 'exact', head: true }).eq('brew_id', brew_id)
  if ((count ?? 0) >= MAX_PHOTOS) return NextResponse.json({ error: `A batch can have up to ${MAX_PHOTOS} photos.` }, { status: 400 })

  const path = `${brew_id}/${randomUUID()}.jpg`
  const { error: upError } = await db.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' })
  if (upError) return NextResponse.json({ error: `Photo not saved: ${upError.message}` }, { status: 500 })
  const { data: row, error } = await db.from('pack_photos')
    .insert({ brew_id, path, created_by: user.email ?? user.id }).select('id').single()
  if (error || !row) {
    await db.storage.from(PHOTO_BUCKET).remove([path])
    return NextResponse.json({ error: `Photo not saved: ${error?.message}` }, { status: 500 })
  }

  // From History: update the post now. At packaging, the packaging save posts it.
  if (publish) publishPackReportLater(brew_id, { actor: user.email })
  const { data: signed } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ id: row.id, url: signed?.signedUrl ?? null })
}

export async function DELETE(req: Request) {
  const user = await brewer()
  if (!user) return NextResponse.json({ error: 'Only brewers can remove photos.' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which photo?' }, { status: 400 })

  const db = createServiceClient()
  const { data: photo } = await db.from('pack_photos').select('brew_id, path').eq('id', id).maybeSingle()
  if (!photo) return NextResponse.json({ ok: true })
  await db.from('pack_photos').delete().eq('id', id)
  await db.storage.from(PHOTO_BUCKET).remove([photo.path])
  publishPackReportLater(photo.brew_id, { actor: user.email })
  return NextResponse.json({ ok: true })
}
