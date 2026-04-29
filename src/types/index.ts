// ─── App Settings ────────────────────────────────────────────────────────────

export interface AppSettings {
  diacetyl_rest_temp_c: number
  on_chill_temp_c: number
  ale_weeks: number
  lager_weeks: number
  default_hop_load: 'low' | 'medium' | 'high'
  default_brew_volume_l: number | null
  // Excise rates ($/LaL) — updated ~6-monthly
  excise_rate_can_std: number
  excise_rate_keg_std: number
  excise_rate_rtd: number
  excise_rate_keg_mid: number
  // SA Canning contract rates — cost per can = (vol_ml/1000) * per_l + per_end
  sa_canning_rate_per_l: number    // $/litre fill
  sa_canning_rate_per_end: number  // $/end (lid) per can
}

export const DEFAULT_SETTINGS: AppSettings = {
  diacetyl_rest_temp_c: 21,
  on_chill_temp_c: 2,
  ale_weeks: 4,
  lager_weeks: 6,
  default_hop_load: 'medium',
  default_brew_volume_l: null,
  excise_rate_can_std: 63.75,
  excise_rate_keg_std: 43.39,
  excise_rate_rtd: 107.99,
  excise_rate_keg_mid: 33.11,
  sa_canning_rate_per_l: 0.99,
  sa_canning_rate_per_end: 0.069,
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export type RecipeTag = 'core' | 'seasonal' | 'limited' | 'collaboration'

export const RECIPE_TAGS: RecipeTag[] = ['core', 'seasonal', 'limited', 'collaboration']

export const RECIPE_TAG_LABELS: Record<RecipeTag, string> = {
  core: 'Core',
  seasonal: 'Seasonal',
  limited: 'Limited',
  collaboration: 'Collab',
}

export const RECIPE_TAG_COLOURS: Record<RecipeTag, string> = {
  core: 'bg-blue-50 text-blue-700 border-blue-200',
  seasonal: 'bg-[#09434d]/10 text-[#09434d] border-[#09434d]/20',
  limited: 'bg-orange-50 text-orange-700 border-orange-200',
  collaboration: 'bg-purple-50 text-purple-700 border-purple-200',
}

export type TankStage =
  | 'empty'
  | 'cleaning'
  | 'filled'
  | 'active_ferment'
  | 'diacetyl_rest'
  | 'vdk_pass'
  | 'on_chill'
  | 'ready'
  | 'transferred'
  | 'packaged'

export type TankType = 'fermenter' | 'brite'

export type BeerStyle =
  | 'Lager'
  | 'Pilsner'
  | 'Pale Ale'
  | 'IPA'
  | 'Hazy IPA / NEIPA'
  | 'Red IPA'
  | 'Red Ale'
  | 'Brown Ale'
  | 'Porter'
  | 'Stout'
  | 'Saison'
  | 'Wheat'
  | 'Sour'
  | 'Fruited Sour'
  | 'Pastry Stout'
  | 'Belgian'
  | 'Other'

export interface StyleConfig {
  name: BeerStyle
  hex: string
}

export interface Tank {
  id: string
  name: string
  type: TankType
  frigid_tank_name: string | null
  frigid_asset_id: string | null
  sort_order: number
  desired_set_point_c?: number | null
}

export type PackageFormat = '24x375' | '16x440' | 'keg30' | 'keg50'

export const PACKAGE_FORMATS: { format: PackageFormat; label: string; volume_l: number }[] = [
  { format: '24x375', label: '24 × 375 mL', volume_l: 9.0 },
  { format: '16x440', label: '16 × 440 mL', volume_l: 7.04 },
  { format: 'keg30',  label: 'Keg 30 L',    volume_l: 30 },
  { format: 'keg50',  label: 'Keg 50 L',    volume_l: 50 },
]

export interface Brew {
  id: string
  recipe_id: string | null
  tank_id: string
  brew_day: string
  volume_l: number
  og_plato: number | null
  stage: TankStage
  beer_name: string
  style: string | null
  notes: string | null
  batch_code?: string | null
}

export interface GravityReading {
  id: string
  brew_id: string
  tank_id: string
  recorded_at: string
  plato: number | null
  ph: number | null
  recorded_by: string
  notes: string | null
}

export type VdkResult = 'high' | 'medium' | 'low' | 'pass'

export type HopLoad = 'low' | 'medium' | 'high'

export const HOP_LOAD_LOSS: Record<HopLoad, number> = {
  low: 0.05,
  medium: 0.10,
  high: 0.15,
}

export const HOP_LOAD_LABELS: Record<HopLoad, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export type ExciseCategory = 'standard' | 'rtd' | 'mid_strength'

export const EXCISE_CATEGORY_LABELS: Record<ExciseCategory, string> = {
  standard: 'Standard beer',
  rtd: 'RTD',
  mid_strength: 'Mid-strength',
}

export interface PackagingSplit {
  id: string
  brew_id: string | null
  scheduled_brew_id?: string | null
  hop_load: HopLoad
  qty_24x375: number
  qty_16x440: number
  qty_keg30: number
  qty_keg50: number
  notes: string | null
  // Excise & canning fields
  abv: number | null
  excise_category: ExciseCategory | null
  clip_colour: string | null
  collars_on_site: number
  decals_on_site: number
}

export interface NextScheduledBrew {
  id: string
  scheduled_date: string
  recipe_name: string | null
  recipe: { name: string } | null
}

export interface TankDashboardData {
  tank: Tank
  brew: Brew | null
  latest_gravity: GravityReading | null
  temperature: number | null
  set_point_c: number | null
  temperature_recorded_at: string | null
  days_in_tank: number | null
  style_colour?: string | null
  latest_vdk?: { result: VdkResult; recorded_at: string } | null
  packaging_split?: PackagingSplit | null
  next_scheduled_brew?: NextScheduledBrew | null
}

export const STAGE_LABELS: Record<TankStage, string> = {
  empty: 'Empty',
  cleaning: 'Cleaning',
  filled: 'Filled',
  active_ferment: 'Active Ferment',
  diacetyl_rest: 'Diacetyl Rest',
  vdk_pass: 'VDK Pass',
  on_chill: 'On Chill',
  ready: 'Ready',
  transferred: 'Transferred',
  packaged: 'Packaged',
}

export const STAGE_ORDER: TankStage[] = [
  'empty',
  'cleaning',
  'filled',
  'active_ferment',
  'diacetyl_rest',
  'vdk_pass',
  'on_chill',
  'ready',
  'transferred',
  'packaged',
]

export const STYLE_COLOURS: StyleConfig[] = [
  { name: 'Lager', hex: '#F5D547' },
  { name: 'Pilsner', hex: '#EAC435' },
  { name: 'Pale Ale', hex: '#E89B2C' },
  { name: 'IPA', hex: '#D67D1F' },
  { name: 'Hazy IPA / NEIPA', hex: '#E8A040' },
  { name: 'Red IPA', hex: '#8B2D1A' },
  { name: 'Red Ale', hex: '#A23E1F' },
  { name: 'Brown Ale', hex: '#5D3A1F' },
  { name: 'Porter', hex: '#3A2515' },
  { name: 'Stout', hex: '#1A0F08' },
  { name: 'Saison', hex: '#E0A028' },
  { name: 'Wheat', hex: '#E8C547' },
  { name: 'Sour', hex: '#C25E5E' },
  { name: 'Fruited Sour', hex: '#D63E5E' },
  { name: 'Pastry Stout', hex: '#2A1810' },
  { name: 'Belgian', hex: '#B8651F' },
  { name: 'Other', hex: '#888888' },
]

export function getStyleColour(style: BeerStyle | string | null): string {
  if (!style) return '#888888'
  return STYLE_COLOURS.find((s) => s.name === style)?.hex ?? '#888888'
}

// ─── Recipes ────────────────────────────────────────────────────────────────

export type IngredientCategory =
  | 'malt'
  | 'hop'
  | 'yeast'
  | 'adjunct'
  | 'finings'
  | 'water_treatment'
  | 'other'

export type AdditionStage =
  | 'malt'
  | 'mash_addition'
  | 'mash_hop'
  | 'kettle_addition'
  | 'kettle_hop'
  | 'dry_hop'
  | 'yeast'
  | 'process'

export const ADDITION_STAGE_LABELS: Record<AdditionStage, string> = {
  malt: 'Malt / Grain',
  mash_addition: 'Mash Addition',
  mash_hop: 'Mash Hop',
  kettle_addition: 'Kettle Addition',
  kettle_hop: 'Kettle / Whirlpool Hop',
  dry_hop: 'Dry Hop',
  yeast: 'Yeast',
  process: 'Process',
}

export const ADDITION_STAGE_ORDER: AdditionStage[] = [
  'malt',
  'mash_addition',
  'mash_hop',
  'kettle_addition',
  'kettle_hop',
  'dry_hop',
  'yeast',
  'process',
]

export interface RecipeIngredient {
  id: string
  recipe_id: string
  ingredient_id: string | null
  name: string
  category: IngredientCategory
  addition_stage: AdditionStage
  quantity: number | null
  unit: string | null
  time_minutes: number | null
  trigger: string | null
  sort_order: number
}

export interface Recipe {
  id: string
  name: string
  version: number
  style: BeerStyle | string | null
  tag: RecipeTag | null
  target_abv: number | null
  target_og_plato: number | null
  target_fg_plato: number | null
  target_ibu: number | null
  target_ebc: number | null
  brew_volume_l: number | null
  foundation_l: number | null
  sparge_l: number | null
  boil_duration_min: number | null
  mash_temp_c: number | null
  pitch_temp_c: number | null
  ferment_temp_c: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  ingredients?: RecipeIngredient[]
}

export type ScheduledBrewStatus = 'planned' | 'confirmed' | 'brewing' | 'done' | 'cancelled'
export type ScheduledBrewEventType = 'brew' | 'pack' | 'transfer'
export type ScheduledBrewType = 'ale' | 'lager'

export interface ScheduledBrew {
  id: string
  scheduled_date: string   // 'YYYY-MM-DD'
  recipe_id: string | null
  recipe_name: string | null
  tank_id: string | null
  dest_tank_id: string | null
  notes: string | null
  status: ScheduledBrewStatus
  event_type: ScheduledBrewEventType
  brew_type: ScheduledBrewType | null
  linked_brew_id: string | null
  created_at: string
  updated_at: string
  // joined
  recipe?: { id: string; name: string; style: string | null } | null
  tank?: { id: string; name: string } | null
  dest_tank?: { id: string; name: string } | null
}
