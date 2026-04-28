-- ============================================================
-- 003: Ingredient prices from supplier price lists
-- ============================================================

create table ingredient_prices (
  id              uuid primary key default gen_random_uuid(),
  ingredient_id   uuid not null references ingredients(id) on delete cascade,
  supplier        text not null,
  supplier_code   text,
  price_per_unit  numeric(10,4),
  unit            text not null default 'kg',
  imported_at     timestamptz not null default now(),
  unique (ingredient_id, supplier)
);

alter table ingredient_prices enable row level security;

create policy "authenticated read" on ingredient_prices
  for select using (auth.role() = 'authenticated');

create policy "brewer write ingredient prices" on ingredient_prices
  for all using (get_my_role() in ('admin', 'brewer'));
