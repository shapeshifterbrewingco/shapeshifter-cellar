-- ============================================================
-- 027: Recipe costing — packaging material price book, clarity
--      additive templates, overhead rates, cost snapshots.
--
-- Produces a true cost per can / per carton / per keg by:
--   1. scaling recipe ingredients to the volume that went into tank
--   2. adding the bright/hazy process additives
--   3. dividing by the litres that survive losses, not the planned volume
--   4. adding packaging materials, contract canning and overheads
-- Excise is calculated alongside but never folded into the unit cost
-- (SSBC sits under the $350k threshold on a 100% rebate).
-- ============================================================

-- ── Packaging material price book ────────────────────────────
create table if not exists packaging_materials (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  category       text        not null check (category in (
                   'can','end','carton','can_label','carton_label',
                   'collar','decal','clip','gas','other')),
  unit           text        not null default 'each',
  price_per_unit numeric(10,4) null,
  supplier       text        null,
  supplier_code  text        null,
  notes          text        null,
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists packaging_materials_name_unique
  on packaging_materials (lower(name));

-- ── How much of each material a package format consumes ──────
-- qty_per_unit is per CARTON for can formats, per KEG for keg formats.
create table if not exists format_material_usage (
  id           uuid    primary key default gen_random_uuid(),
  format       text    not null check (format in ('24x375','16x440','keg30','keg50')),
  material_id  uuid    not null references packaging_materials(id) on delete cascade,
  qty_per_unit numeric not null default 1,
  unique (format, material_id)
);

-- ── Bright vs hazy process additives ─────────────────────────
-- Dosed per 1,000 L into tank. Editable — this is Carla's process, not a constant.
create table if not exists clarity_additives (
  id            uuid    primary key default gen_random_uuid(),
  clarity       text    not null check (clarity in ('bright','hazy')),
  ingredient_id uuid    not null references ingredients(id) on delete cascade,
  qty_per_1000l numeric not null,
  unit          text    not null default 'kg',
  notes         text    null,
  unique (clarity, ingredient_id)
);

-- ── Costing inputs carried on the packaging split ────────────
alter table packaging_splits
  add column if not exists clarity            text    null
    check (clarity in ('bright','hazy')),
  add column if not exists volume_into_tank_l numeric null,
  add column if not exists loss_pct           numeric null;

-- ── Overhead rates + costing defaults ────────────────────────
alter table app_settings
  add column if not exists overhead_labour_per_batch    numeric not null default 0,
  add column if not exists overhead_energy_per_batch    numeric not null default 0,
  add column if not exists overhead_chemicals_per_batch numeric not null default 0,
  add column if not exists overhead_water_per_batch     numeric not null default 0,
  add column if not exists overhead_other_per_l         numeric not null default 0,
  add column if not exists default_loss_pct             numeric not null default 10,
  add column if not exists default_clarity              text    not null default 'bright'
    check (default_clarity in ('bright','hazy'));

-- ── Preferred price ──────────────────────────────────────────
-- One ingredient can carry several prices (different suppliers, producers,
-- pack sizes). Costing uses the preferred row when one is flagged, and the
-- cheapest otherwise. Without this, "Citra" could cost anywhere from
-- $10.06/kg to $540 depending on which row happened to import last.
alter table ingredient_prices
  add column if not exists is_preferred boolean not null default false;

create unique index if not exists ingredient_prices_one_preferred
  on ingredient_prices (ingredient_id) where is_preferred;

-- ── Cost snapshots ───────────────────────────────────────────
-- Prices move. Stamp what was used so batches stay comparable.
create table if not exists batch_cost_snapshots (
  id         uuid        primary key default gen_random_uuid(),
  recipe_id  uuid        null references recipes(id) on delete set null,
  brew_id    uuid        null references brews(id)   on delete cascade,
  label      text        null,
  costed_at  timestamptz not null default now(),
  costed_by  text        null,
  inputs     jsonb       not null,
  result     jsonb       not null
);

create index if not exists batch_cost_snapshots_recipe_idx
  on batch_cost_snapshots (recipe_id, costed_at desc);
create index if not exists batch_cost_snapshots_brew_idx
  on batch_cost_snapshots (brew_id, costed_at desc);

-- ── RLS — follows migration 012's authenticated-user pattern ─
alter table packaging_materials   enable row level security;
alter table format_material_usage enable row level security;
alter table clarity_additives     enable row level security;
alter table batch_cost_snapshots  enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'packaging_materials','format_material_usage',
    'clarity_additives','batch_cost_snapshots'
  ] loop
    execute format(
      'create policy "authenticated read %1$s" on %1$I for select to authenticated using (true)', t);
    execute format(
      'create policy "authenticated insert %1$s" on %1$I for insert to authenticated with check (true)', t);
    execute format(
      'create policy "authenticated update %1$s" on %1$I for update to authenticated using (true)', t);
    execute format(
      'create policy "authenticated delete %1$s" on %1$I for delete to authenticated using (true)', t);
  end loop;
end $$;

-- ── Seed the material price book with the real line items ────
-- Prices left null on purpose: they must be entered from actual
-- supplier invoices, not guessed. Anything unpriced is reported
-- as a gap rather than silently costed at zero.
insert into packaging_materials (name, category, unit) values
  ('375mL can',            'can',          'each'),
  ('440mL can',            'can',          'each'),
  ('Can end',              'end',          'each'),
  ('375mL can label',      'can_label',    'each'),
  ('440mL can label',      'can_label',    'each'),
  ('24-can carton',        'carton',       'each'),
  ('16-can carton',        'carton',       'each'),
  ('Carton label',         'carton_label', 'each'),
  ('Keg collar',           'collar',       'each'),
  ('Keg decal',            'decal',        'each'),
  ('Keg clip',             'clip',         'each'),
  ('CO2',                  'gas',          'kg')
on conflict do nothing;

-- Default consumption per carton / per keg.
insert into format_material_usage (format, material_id, qty_per_unit)
select f.format, m.id, f.qty
from (values
  ('24x375','375mL can',       24),
  ('24x375','Can end',         24),
  ('24x375','375mL can label', 24),
  ('24x375','24-can carton',    1),
  ('24x375','Carton label',     1),
  ('16x440','440mL can',       16),
  ('16x440','Can end',         16),
  ('16x440','440mL can label', 16),
  ('16x440','16-can carton',    1),
  ('16x440','Carton label',     1),
  ('keg30', 'Keg collar',       1),
  ('keg30', 'Keg decal',        1),
  ('keg30', 'Keg clip',         1),
  ('keg50', 'Keg collar',       1),
  ('keg50', 'Keg decal',        1),
  ('keg50', 'Keg clip',         1)
) as f(format, material_name, qty)
join packaging_materials m on lower(m.name) = lower(f.material_name)
on conflict (format, material_id) do nothing;
