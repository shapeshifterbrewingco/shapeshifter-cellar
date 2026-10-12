import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isStaffEmail } from '@/lib/auth-domain'

const SESSION_COOKIE = {
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60,
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            // Keep a deletion as a deletion; give everything else the 30 days
            supabaseResponse.cookies.set(name, value, value ? { ...options, ...SESSION_COOKIE } : options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Stay signed in for 30 days from the last visit. The cookies are re-issued
  // by the server on every request: Safari on iPhone cuts cookies written by
  // page script to 7 days, but leaves server-set ones alone.
  if (user && isStaffEmail(user.email)) {
    const fresh = new Set(supabaseResponse.cookies.getAll().map((c) => c.name))
    for (const c of request.cookies.getAll()) {
      if (!c.name.startsWith('sb-') || !c.value || fresh.has(c.name)) continue
      supabaseResponse.cookies.set(c.name, c.value, SESSION_COOKIE)
    }
  }

  const publicPaths = ['/login', '/auth/callback', '/api/frigid-poll', '/manifest.webmanifest']
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p))

  // TEMPORARY (Oct 2026): tracing why the iPhone home-screen app forgets its
  // sign-in. No cookie values or personal data, just whether the cookie came
  // back and what kind of browser asked. Remove once that is fixed.
  const path = request.nextUrl.pathname
  if (path === '/auth/callback' || (!user && !isPublic && request.headers.get('sec-fetch-dest') === 'document')) {
    const ua = request.headers.get('user-agent') ?? ''
    console.log('[auth-trace]', JSON.stringify({
      path,
      signedIn: !!user,
      authCookies: request.cookies.getAll().filter((c) => c.name.startsWith('sb-')).length,
      iphone: /iPhone|iPad/.test(ua),
      // Safari and its in-app sheet say "Safari"; a home-screen web app does not
      safariView: /Version\/[\d.]+.*Safari/.test(ua),
      site: request.headers.get('sec-fetch-site'),
    }))
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Signed in, but not with a Shapeshifter account: sign out and send back
  if (user && !isStaffEmail(user.email) && !isPublic) {
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = '?error=not_staff'
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
