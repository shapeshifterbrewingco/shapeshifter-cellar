/** Shared constants for the packaging material price book. */

export const MATERIAL_CATEGORIES = [
  'can', 'end', 'carton', 'can_label', 'carton_label',
  'collar', 'decal', 'clip', 'gas', 'other',
] as const

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]

export const MATERIAL_CATEGORY_LABELS: Record<MaterialCategory, string> = {
  can: 'Can', end: 'End', carton: 'Carton', can_label: 'Can label',
  carton_label: 'Carton label', collar: 'Keg collar', decal: 'Keg decal',
  clip: 'Keg clip', gas: 'Gas', other: 'Other',
}
