import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert °Plato to specific gravity, then apply ABV formula
export function platoToSg(plato: number): number {
  return plato / (258.6 - 227.1 * (plato / 258.2)) + 1
}

export function calcAbv(ogPlato: number, fgPlato: number): number {
  const og = platoToSg(ogPlato)
  const fg = platoToSg(fgPlato)
  return (76.08 * (og - fg) / (1.775 - og)) * (fg / 0.794)
}

// "james@shapeshifterbrewing.com.au" → "James"
export function formatUserName(emailOrName: string): string {
  const local = emailOrName.includes('@') ? emailOrName.split('@')[0] : emailOrName
  return local.charAt(0).toUpperCase() + local.slice(1)
}

/**
 * Water to add to bring wort down to a target gravity. The sugar in the tank
 * stays the same, so volume x gravity points is the same before and after
 * (the method Brewer's Friend uses). Null if the numbers cannot give an answer.
 */
export function dilution(volumeL: number, platoNow: number, platoTarget: number): { waterL: number; finalL: number } | null {
  if (!(volumeL > 0) || !(platoNow > 0) || !(platoTarget > 0) || platoTarget >= platoNow) return null
  const finalL = (volumeL * (platoToSg(platoNow) - 1)) / (platoToSg(platoTarget) - 1)
  return { waterL: finalL - volumeL, finalL }
}

/**
 * Spirit to add to a non-alcoholic base to reach a target strength. The spirit
 * adds to the volume as well as the alcohol, so the alcohol in the spirit has
 * to cover the whole of the final volume, not just the base:
 *   spirit x strength = (base + spirit) x target
 * Percentages are whole numbers (4.5, 96). Null if the numbers cannot work.
 */
export function spiritDose(baseL: number, targetAbv: number, spiritAbv: number): { spiritL: number; finalL: number } | null {
  if (!(baseL > 0) || !(targetAbv > 0) || !(spiritAbv > targetAbv) || spiritAbv > 100) return null
  const spiritL = (baseL * targetAbv) / (spiritAbv - targetAbv)
  return { spiritL, finalL: baseL + spiritL }
}
