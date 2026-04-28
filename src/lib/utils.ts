import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Convert °Plato to specific gravity, then apply ABV formula
function platoToSg(plato: number): number {
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
