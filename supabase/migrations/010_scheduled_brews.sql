-- ============================================================
-- Scheduled Brews — brew planning calendar
-- ============================================================

create table scheduled_brews (
  id             uuid        primary key default gen_random_uuid(),
  scheduled_date date        not null,
  recipe_id      uuid        references recipes(id) on delete set null,
  recipe_name    text,         -- free-text name if recipe not yet in system
  tank_id        uuid        references tanks(id) on delete set null,
  notes          text,
  status         text        not null default 'planned'
                             check (status in ('planned','brewing','done','cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table scheduled_brews enable row level security;

create policy "authenticated users can read scheduled_brews"
  on scheduled_brews for select to authenticated using (true);

create policy "authenticated users can insert scheduled_brews"
  on scheduled_brews for insert to authenticated with check (true);

create policy "authenticated users can update scheduled_brews"
  on scheduled_brews for update to authenticated using (true);

create policy "authenticated users can delete scheduled_brews"
  on scheduled_brews for delete to authenticated using (true);
