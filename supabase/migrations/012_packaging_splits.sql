-- ============================================================
-- Packaging splits — planned packaging per brew
-- Linked to brew_id so it travels with transfers.
-- ============================================================

create table packaging_splits (
  id             uuid        primary key default gen_random_uuid(),
  brew_id        uuid        not null unique references brews(id) on delete cascade,
  hop_load       text        not null check (hop_load in ('low','medium','high')),
  qty_24x375     integer     not null default 0,
  qty_16x440     integer     not null default 0,
  qty_keg30      integer     not null default 0,
  qty_keg50      integer     not null default 0,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table packaging_splits enable row level security;

create policy "authenticated users can read packaging_splits"
  on packaging_splits for select to authenticated using (true);

create policy "authenticated users can insert packaging_splits"
  on packaging_splits for insert to authenticated with check (true);

create policy "authenticated users can update packaging_splits"
  on packaging_splits for update to authenticated using (true);

create policy "authenticated users can delete packaging_splits"
  on packaging_splits for delete to authenticated using (true);
