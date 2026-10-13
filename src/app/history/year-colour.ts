// Each year gets its own colour in History so a long list reads at a glance.
// All three are brand tokens that already flip correctly in dark mode.
const YEAR_BG = ['bg-malt-dark', 'bg-primary', 'bg-charcoal']

/** Background class for a year, from "2026" or a "2026-10" month key. */
export const yearBg = (key: string) => YEAR_BG[Number(key.slice(0, 4)) % YEAR_BG.length]
