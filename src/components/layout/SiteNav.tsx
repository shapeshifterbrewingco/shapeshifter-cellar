'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, FlaskConical, Clock, Thermometer, BookOpen, Package2, PackageCheck, BarChart3, LogOut, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/',            label: 'Cellar',           icon: FlaskConical },
  { href: '/schedule',    label: 'Schedule',         icon: CalendarDays },
  { href: '/history',     label: 'History',          icon: Clock },
  { href: '/readings',    label: 'Readings',         icon: Thermometer },
  { href: '/packaging',   label: 'Packaging',        icon: PackageCheck },
  { href: '/reports',     label: 'Reports',          icon: BarChart3 },
  { href: '/recipes',     label: 'Recipes',          icon: BookOpen },
  { href: '/ingredients', label: 'Ingredients',      icon: Package2 },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="flex flex-col gap-1 px-3 mt-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
            isActive(href)
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <Icon className="h-5 w-5 flex-shrink-0" />
          {label}
        </Link>
      ))}
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

export function SiteNav() {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-44 bg-primary fixed top-0 left-0 bottom-0 z-30">
        <div className="px-4 py-5 border-b border-white/10">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>
        <div className="px-4 py-3 border-t border-white/10 flex flex-col gap-2">
          <p className="text-white/25 text-xs">Shapeshifter Brewing Co</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-white/40 hover:text-white/80 text-xs transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
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
            <div className="flex-1 overflow-y-auto py-2">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </>
      )}
    </>
  )
}
