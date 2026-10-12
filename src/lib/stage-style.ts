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

export const stageStyle = (stage: string): StageStyle => STAGE_STYLE[stage] ?? { ...NEUTRAL, label: stage }
