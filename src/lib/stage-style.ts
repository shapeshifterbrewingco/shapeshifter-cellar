// How a stage looks, everywhere. Stage is the one place a tank carries colour,
// and the four live stages take the four ingredient colours from the
// Shapeshifter brand guidelines (Soft Launch, 2026): yeast, malt, hops, water.

export interface StageStyle {
  label: string
  /** Pill background and text */
  pill: string
  /** The small dot inside the pill */
  dot: string
  /** Solid accent, for a left edge or a marker */
  accent: string
}

const NEUTRAL: StageStyle = { label: '', pill: 'bg-charcoal/8 text-charcoal/70', dot: 'bg-charcoal/40', accent: 'border-l-charcoal/15' }

export const STAGE_STYLE: Record<string, StageStyle> = {
  // Yeast at work
  active_ferment: { label: 'Fermenting',    pill: 'bg-yeast text-charcoal',   dot: 'bg-malt',  accent: 'border-l-yeast' },
  diacetyl_rest:  { label: 'Diacetyl rest', pill: 'bg-malt/25 text-charcoal', dot: 'bg-malt',  accent: 'border-l-malt' },
  vdk_pass:       { label: 'VDK pass',      pill: 'bg-hops text-white',       dot: 'bg-yeast', accent: 'border-l-hops' },
  // Cold
  on_chill:       { label: 'On chill',      pill: 'bg-water text-hops',       dot: 'bg-hops',  accent: 'border-l-water' },

  empty:       { ...NEUTRAL, label: 'Empty' },
  cleaning:    { ...NEUTRAL, label: 'Cleaning' },
  filled:      { ...NEUTRAL, label: 'Filled' },
  ready:       { ...NEUTRAL, label: 'Ready' },
  transferred: { ...NEUTRAL, label: 'Transferred' },
  packaged:    { ...NEUTRAL, label: 'Packaged' },
}

// A brew day still running: started, nothing in the tank to ferment yet
export const IN_PRODUCTION: StageStyle = { label: 'In production', pill: 'bg-malt text-white', dot: 'bg-yeast', accent: 'border-l-malt' }

/** True while a brew day is open: in its first stage with no OG on the tank yet. */
export const inProduction = (brew: { stage: string; og_plato: number | null } | null | undefined) =>
  !!brew && brew.stage === 'active_ferment' && brew.og_plato == null

/** How a brew's stage looks, with a brew day in progress shown as such rather than as fermenting. */
export const brewStageStyle = (brew: { stage: string; og_plato: number | null }): StageStyle =>
  inProduction(brew) ? IN_PRODUCTION : stageStyle(brew.stage)

export const stageStyle = (stage: string): StageStyle => STAGE_STYLE[stage] ?? { ...NEUTRAL, label: stage }
