'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, FlaskConical, Clock, Thermometer, BookOpen, Package2, PackageCheck, BarChart3, LogOut, LogIn, CalendarDays, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/',            label: 'Cellar',           icon: FlaskConical },
  { href: '/schedule',    label: 'Schedule',         icon: CalendarDays },
  { href: '/history',     label: 'History',          icon: Clock },
  { href: '/readings',    label: 'Temp Log',         icon: Thermometer },
  { href: '/packaging',   label: 'Packaging',        icon: PackageCheck },
  { href: '/reports',     label: 'Reports',          icon: BarChart3 },
  { href: '/recipes',     label: 'Recipes',          icon: BookOpen },
  { href: '/ingredients', label: 'Ingredients',      icon: Package2 },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  const linkClass = (href: string) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors ${
      isActive(href)
        ? 'bg-white/15 text-white font-semibold'
        : 'text-white/55 hover:text-white hover:bg-white/10 font-medium'
    }`

  return (
    <nav className="flex flex-col h-full px-3 mt-4">
      <div className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={onNavigate} className={linkClass(href)}>
            <Icon className="h-5 w-5 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* Settings — pinned at bottom */}
      <div className="mt-auto pt-3 border-t border-white/10 pb-1">
        <Link href="/settings" onClick={onNavigate} className={linkClass('/settings')}>
          <Settings className="h-5 w-5 flex-shrink-0" />
          Settings
        </Link>
      </div>
    </nav>
  )
}

function Logo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center justify-center">
      <img
        src="/wolf.svg"
        alt="Shapeshifter Cellar"
        className={size === 'sm' ? 'h-[60px] w-[60px]' : 'h-24 w-24'}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

function AuthButton({ onNavigate }: { onNavigate?: () => void }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setSignedIn(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  const btnClass = "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-white/55 hover:text-white hover:bg-white/10 transition-colors w-full"

  if (signedIn === null) return null // don't flash wrong state

  if (!signedIn) {
    return (
      <Link href="/login" onClick={onNavigate} className={btnClass}>
        <LogIn className="h-5 w-5 flex-shrink-0" />
        Sign in
      </Link>
    )
  }

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  return (
    <button onClick={handleLogout} className={btnClass}>
      <LogOut className="h-5 w-5 flex-shrink-0" />
      Sign out
    </button>
  )
}

export function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-44 bg-primary fixed top-0 left-0 bottom-0 z-30">
        <div className="px-4 py-5 border-b border-white/10 flex flex-col items-center gap-1">
          <Logo />
          <p className="text-white font-bold text-xs text-center leading-tight">Shapeshifter Brewing Co</p>
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto py-2">
          <NavLinks />
        </div>
        <div className="px-3 py-3 border-t border-white/10">
          <AuthButton />
        </div>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-primary flex items-center justify-between px-4 h-20">
        <Logo size="sm" />
        <button
          onClick={() => setOpen(true)}
          className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* ── Mobile drawer ────────────────────────────────────── */}
      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="md:hidden fixed top-0 left-0 bottom-0 w-64 bg-primary z-50 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
              <Logo />
              <button
                onClick={() => setOpen(false)}
                className="text-white/50 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 flex flex-col overflow-y-auto py-2">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="px-3 py-3 border-t border-white/10">
              <AuthButton onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
