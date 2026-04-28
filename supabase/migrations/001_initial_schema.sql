-- ============================================================
-- Shapeshifter Cellar — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- REFERENCE TABLES
-- ============================================================

create table beer_styles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  hex_colour  text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into beer_styles (name, hex_colour, sort_order) values
  ('Lager',            '#F5D547', 1),
  ('Pilsner',          '#EAC435', 2),
  ('Pale Ale',         '#E89B2C', 3),
  ('IPA',              '#D67D1F', 4),
  ('Hazy IPA / NEIPA', '#E8A040', 5),
  ('Red IPA',          '#8B2D1A', 6),
  ('Red Ale',          '#A23E1F', 7),
  ('Brown Ale',        '#5D3A1F', 8),
  ('Porter',           '#3A2515', 9),
  ('Stout',            '#1A0F08', 10),
  ('Saison',           '#E0A028', 11),
  ('Wheat',            '#E8C547', 12),
  ('Sour',             '#C25E5E', 13),
  ('Fruited Sour',     '#D63E5E', 14),
  ('Pastry Stout',     '#2A1810', 15),
  ('Belgian',          '#B8651F', 16),
  ('Other',            '#888888', 17);

-- ============================================================
-- TANKS
-- ============================================================

create table tanks (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,          -- "FV1", "BBT A"
  type              text not null check (type in ('fermenter', 'brite')),
  frigid_tank_name  text,                          -- "FV1", "BRITE A" etc.
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

insert into tanks (name, type, frigid_tank_name, sort_order) values
  ('FV1',  'fermenter', 'FV1',     1),
  ('FV2',  'fermenter', 'FV2',     2),
  ('FV3',  'fermenter', 'FV3',     3),
  ('FV4',  'fermenter', 'FV4',     4),
  ('FV5',  'fermenter', 'FV5',     5),
  ('FV6',  'fermenter', 'FV6',     6),
  ('FV7',  'fermenter', 'FV7',     7),
  ('FV8',  'fermenter', 'FV8',     8),
  ('FV9',  'fermenter', 'FV9',     9),
  ('FV10', 'fermenter', 'FV10',   10),
  ('FV11', 'fermenter', 'FV11',   11),
  ('BBT A', 'brite',   'BRITE A', 12),
  ('BBT B', 'brite',   'BRITE B', 13);

-- ============================================================
-- USERS / PROFILES
-- ============================================================

create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'viewer' check (role in ('admin', 'brewer', 'sales', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- RECIPES
-- ============================================================

create table recipes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  version         integer not null default 1,
  style           text references beer_styles(name),
  target_abv      numeric(4,2),
  target_og_plato numeric(5,2),
  target_fg_plato numeric(5,2),
  target_ibu      integer,
  target_ebc      integer,
  brew_volume_l   numeric(8,2),
  foundation_l    numeric(8,2),
  sparge_l        numeric(8,2),
  boil_duration_min integer,
  mash_temp_c     numeric(4,1),
  pitch_temp_c    numeric(4,1),
  ferment_temp_c  numeric(4,1),
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create type ingredient_category as enum (
  'malt', 'hop', 'yeast', 'adjunct', 'finings', 'water_treatment', 'other'
);

create table ingredients (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  category        ingredient_category not null,
  default_unit    text not null default 'kg',
  notes           text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create table recipe_ingredients (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid not null references recipes(id) on delete cascade,
  ingredient_id   uuid references ingredients(id),
  name            text not null,                  -- denormalised for display
  category        ingredient_category not null,
  addition_stage  text not null,                  -- 'malt','mash_addition','mash_hop','kettle_addition','kettle_hop','dry_hop','yeast','process'
  quantity        numeric(10,3),
  unit            text,
  time_minutes    integer,                        -- for kettle/whirlpool hops
  trigger         text,                           -- "FG", "5°P", "CHILL", "TRANSFER"
  sort_order      integer not null default 0
);

-- ============================================================
-- BREWS
-- ============================================================

create table brews (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid references recipes(id),
  tank_id         uuid not null references tanks(id),
  brew_day        date not null,
  volume_l        numeric(8,2) not null,
  stage           text not null default 'filled' check (stage in (
    'empty','cleaning','filled','active_ferment','diacetyl_rest',
    'vdk_pass','on_chill','ready','transferred','packaged'
  )),
  beer_name       text not null,
  style           text references beer_styles(name),
  brewer          text,
  notes           text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- ============================================================
-- TANK STAGE HISTORY
-- ============================================================

create table tank_stage_history (
  id          uuid primary key default gen_random_uuid(),
  brew_id     uuid not null references brews(id),
  tank_id     uuid not null references tanks(id),
  stage       text not null,
  transitioned_at timestamptz not null default now(),
  transitioned_by text not null,  -- user email or "kiosk:cellar"
  notes       text
);

-- ============================================================
-- GRAVITY / pH READINGS
-- ============================================================

create table gravity_readings (
  id            uuid primary key default gen_random_uuid(),
  brew_id       uuid not null references brews(id) on delete cascade,
  tank_id       uuid not null references tanks(id),
  recorded_at   timestamptz not null default now(),
  plato         numeric(5,2),
  ph            numeric(4,2),
  recorded_by   text not null,
  notes         text
);

-- ============================================================
-- TEMPERATURE READINGS (high volume — from Frigid)
-- ============================================================

create table temperature_readings (
  id            uuid primary key default gen_random_uuid(),
  tank_id       uuid not null references tanks(id),
  recorded_at   timestamptz not null default now(),
  temperature_c numeric(6,3) not null,
  set_point_c   numeric(6,3)
);

-- Index for fast latest-reading lookups per tank
create index on temperature_readings (tank_id, recorded_at desc);

-- ============================================================
-- TRANSFERS (FV → brite)
-- ============================================================

create table transfers (
  id                uuid primary key default gen_random_uuid(),
  brew_id           uuid not null references brews(id),
  source_tank_id    uuid not null references tanks(id),
  dest_tank_id      uuid not null references tanks(id),
  volume_in_l       numeric(8,2),   -- volume leaving FV
  volume_out_l      numeric(8,2),   -- volume entering brite (entered by brewer)
  transferred_at    timestamptz not null default now(),
  transferred_by    text not null,
  notes             text
);

-- ============================================================
-- PACKAGING RUNS
-- ============================================================

create table packaging_runs (
  id            uuid primary key default gen_random_uuid(),
  brew_id       uuid not null references brews(id),
  tank_id       uuid not null references tanks(id),
  packaged_at   timestamptz not null default now(),
  packaged_by   text not null,
  format        text not null check (format in ('24x375', '16x440', 'keg30', 'keg50')),
  qty           integer not null,
  volume_l      numeric(8,2) not null,
  notes         text
);

-- ============================================================
-- AUDIT LOG
-- ============================================================

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  table_name  text,
  record_id   uuid,
  actor       text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles           enable row level security;
alter table tanks              enable row level security;
alter table beer_styles        enable row level security;
alter table recipes            enable row level security;
alter table recipe_ingredients enable row level security;
alter table ingredients        enable row level security;
alter table brews              enable row level security;
alter table tank_stage_history enable row level security;
alter table gravity_readings   enable row level security;
alter table temperature_readings enable row level security;
alter table transfers          enable row level security;
alter table packaging_runs     enable row level security;
alter table audit_log          enable row level security;

-- Helper: get current user's role
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from profiles where id = auth.uid()
$$;

-- READ: all authenticated users can read most tables
create policy "authenticated read" on tanks            for select using (auth.role() = 'authenticated');
create policy "authenticated read" on beer_styles      for select using (auth.role() = 'authenticated');
create policy "authenticated read" on recipes          for select using (auth.role() = 'authenticated' and deleted_at is null);
create policy "authenticated read" on recipe_ingredients for select using (auth.role() = 'authenticated');
create policy "authenticated read" on ingredients      for select using (auth.role() = 'authenticated' and deleted_at is null);
create policy "authenticated read" on brews            for select using (auth.role() = 'authenticated' and deleted_at is null);
create policy "authenticated read" on tank_stage_history for select using (auth.role() = 'authenticated');
create policy "authenticated read" on gravity_readings for select using (auth.role() = 'authenticated');
create policy "authenticated read" on temperature_readings for select using (auth.role() = 'authenticated');
create policy "authenticated read" on transfers        for select using (auth.role() = 'authenticated');
create policy "authenticated read" on packaging_runs   for select using (auth.role() = 'authenticated');

-- WRITE: brewers and admins can write operational data
create policy "brewer write gravity" on gravity_readings
  for insert with check (get_my_role() in ('admin', 'brewer'));

create policy "brewer write stage history" on tank_stage_history
  for insert with check (get_my_role() in ('admin', 'brewer'));

create policy "brewer write brews" on brews
  for all using (get_my_role() in ('admin', 'brewer'));

create policy "brewer write transfers" on transfers
  for insert with check (get_my_role() in ('admin', 'brewer'));

create policy "brewer write packaging" on packaging_runs
  for insert with check (get_my_role() in ('admin', 'brewer'));

create policy "brewer write recipes" on recipes
  for all using (get_my_role() in ('admin', 'brewer'));

create policy "brewer write recipe ingredients" on recipe_ingredients
  for all using (get_my_role() in ('admin', 'brewer'));

create policy "brewer write ingredients" on ingredients
  for all using (get_my_role() in ('admin', 'brewer'));

-- ADMIN ONLY: temperature writes (done by server-side cron), styles, tanks
create policy "service write temperatures" on temperature_readings
  for insert with check (true);  -- server-side only via service_role key

create policy "admin write styles" on beer_styles
  for all using (get_my_role() = 'admin');

create policy "admin write tanks" on tanks
  for all using (get_my_role() = 'admin');

-- Profiles: users can read all, update own
create policy "read profiles" on profiles
  for select using (auth.role() = 'authenticated');

create policy "update own profile" on profiles
  for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when new.email = 'james@shapeshifterbrewing.com.au' then 'admin'
      when new.email like '%@shapeshifterbrewing.com.au' then 'brewer'
      else 'viewer'
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
