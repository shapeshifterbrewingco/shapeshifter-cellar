import Link from 'next/link'

type NavSection = 'cellar' | 'recipes' | 'ingredients' | 'history' | 'readings'

const BADGE_LABEL: Record<NavSection, string> = {
  cellar: 'DASHBOARD',
  recipes: 'RECIPES',
  ingredients: 'INGREDIENTS',
  history: 'HISTORY',
  readings: 'READINGS',
}

interface SiteHeaderProps {
  active: NavSection
}

export function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="bg-primary px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-white hover:text-white/80 transition-colors">
          Shapeshifter Cellar
        </Link>
        <span className="text-xs text-white/60 bg-white/10 px-2 py-0.5 rounded font-medium">
          {BADGE_LABEL[active]}
        </span>
      </div>
      <nav className="flex items-center gap-1 text-sm">
        {([
          { key: 'cellar', href: '/', label: 'Cellar' },
          { key: 'history', href: '/history', label: 'History' },
          { key: 'readings', href: '/readings', label: 'Readings' },
          { key: 'recipes', href: '/recipes', label: 'Recipes' },
          { key: 'ingredients', href: '/ingredients', label: 'Ingredients' },
        ] as { key: NavSection; href: string; label: string }[]).map(({ key, href, label }) => (
          <Link
            key={key}
            href={href}
            className={active === key
              ? 'bg-white text-primary font-semibold px-4 py-1.5 rounded-full'
              : 'text-white/70 hover:text-white px-4 py-1.5 rounded-full hover:bg-white/10 transition-colors'}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
