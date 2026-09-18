/**
 * Fuzzy matching between recipe ingredient names and the supplier price library.
 *
 * Recipes are written the way a brewer talks — "Weyermann Acidulated", "Citra",
 * "Vic Secret". The library holds supplier catalogue names — "Acidulated Malt"
 * (producer Weyermann), "Citra® Brand HBC 394 T-90 Pellets 1x5kg".
 *
 * This proposes candidates and scores them. It deliberately does NOT decide on
 * its own when the field is crowded: "Citra" matches nine products between
 * $10.06/kg and $540 each, and picking the wrong one silently is worse than
 * asking. Only an unambiguous, high-scoring, single-candidate match auto-links.
 */

export interface MatchCandidate {
  id: string
  name: string
  category: string
  producer: string | null
  supplier: string | null
  pricePerUnit: number | null
  unit: string | null
  score: number
}

const NOISE = [
  'malt', 'hops', 'hop', 'pellets', 'pellet', 't-90', 't90', 't45', 't-45',
  'brand', 'cryo', 'c.v', 'cv', 'organic', 'brewers', 'brewer',
]

/** Strip trademark marks, pack sizes, punctuation and catalogue noise words. */
export function tokenise(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[®™©]/g, ' ')
    .replace(/\b\d+\s*x\s*\d+\s*(kg|g|l|ml)\b/g, ' ')  // 1x5kg, 4x5kg
    .replace(/\b\d+(\.\d+)?\s*(kg|g|l|ml)\b/g, ' ')     // 500g, 100ml
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NOISE.includes(t))
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

/** Character-level similarity. Catches typos: "Carrared" against "Carared". */
function dice(a: string, b: string): number {
  if (a === b) return 1
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const g of ta) if (tb.has(g)) inter++
  return (2 * inter) / (ta.size + tb.size)
}

/**
 * Does this recipe token appear in the library tokens?
 * Exact, or as an abbreviation ("man" for "mandarina", "bav" for "bavaria"),
 * or close enough to be a typo.
 */
function tokenHit(token: string, libraryTokens: string[]): boolean {
  if (libraryTokens.includes(token)) return true
  if (token.length >= 3 && libraryTokens.some((l) => l.startsWith(token))) return true
  if (token.length >= 5 && libraryTokens.some((l) => dice(token, l) >= 0.75)) return true
  return false
}

/**
 * Score one library entry against a recipe ingredient name.
 *
 * Product name and producer are scored separately on purpose. Lumping them
 * into one bag of words ranked "Organic Pilsner Malt" (made by Weyermann)
 * above "Vienna Malt" for a recipe line reading "Weyermann Vienna" — the
 * producer token drowned out the variety, which is the part that matters.
 *
 * 1.0 is an exact name match. Anything under 0.35 is not offered.
 */
export function scoreMatch(
  recipeName: string,
  libraryName: string,
  producer: string | null,
  sameCategory: boolean,
): number {
  const rn = recipeName.toLowerCase().trim()
  const ln = libraryName.toLowerCase().trim()
  if (rn === ln) return 1

  const rt = tokenise(recipeName)
  const nameTokens = tokenise(libraryName)
  const prodTokens = tokenise(producer ?? '')
  if (rt.length === 0) return 0

  // How much of the recipe line the catalogue entry explains. A producer hit
  // counts fully: "Weyermann Acidulated" is entirely explained by
  // "Acidulated Malt" made by Weyermann.
  const hitName = rt.filter((t) => tokenHit(t, nameTokens))
  const hitProd = rt.filter((t) => !tokenHit(t, nameTokens) && tokenHit(t, prodTokens))
  let score = (hitName.length + hitProd.length) / rt.length

  // Penalise catalogue words the recipe never mentions, so the plain base
  // product outranks a speciality variant of it. This has to bite hard:
  // "Vic Secret" matches every word of "Quantum Brite - Vic Secret (VIS)",
  // but that is a per-tin extract, not the hop the recipe means.
  const extra = nameTokens.filter((t) => !tokenHit(t, rt))
  if (nameTokens.length > 0) {
    score *= 1 - 0.45 * (extra.length / nameTokens.length)
  }

  // Rescue names the tokeniser splits differently, such as "Polygel"
  // against "Poly Gel".
  score = Math.max(score, dice(rn.replace(/[^a-z0-9]/g, ''), ln.replace(/[^a-z0-9]/g, '')) * 0.9)

  // A variety match with nothing from the name is not a match at all.
  if (hitName.length === 0 && score < 0.9) score *= 0.5

  score += sameCategory ? 0.1 : -0.15
  return Math.max(0, Math.min(1, score))
}

export interface LibraryEntry {
  id: string
  name: string
  category: string
  producer: string | null
  supplier: string | null
  pricePerUnit: number | null
  unit: string | null
}

export function findCandidates(
  recipeName: string,
  recipeCategory: string | null,
  library: LibraryEntry[],
  limit = 8,
): MatchCandidate[] {
  return library
    .map((e) => ({
      ...e,
      score: scoreMatch(recipeName, e.name, e.producer, e.category === recipeCategory),
    }))
    .filter((e) => e.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Auto-link only at effectively-exact confidence. */
const CONFIDENT = 0.97

/**
 * Safe to link without a human looking at it?
 * Only when the top candidate is effectively an exact match AND nothing else
 * comes close. Ambiguity goes to the brewer, not to a guess — the same hop
 * name spans pellets, cryo and extract at wildly different prices.
 */
export function isConfidentMatch(candidates: MatchCandidate[]): boolean {
  if (candidates.length === 0) return false
  const [top, second] = candidates
  if (top.score < CONFIDENT) return false
  if (second && second.score >= CONFIDENT) return false
  return true
}
