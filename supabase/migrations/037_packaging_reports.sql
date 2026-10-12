-- The packaging report from the back of the paper brew sheet: one per brew.
create table if not exists packaging_reports (
  brew_id uuid primary key references brews(id) on delete cascade,
  best_before date,
  bbt_temp_c numeric,
  bbt_co2_vol numeric,
  bbt_do_ppb numeric,
  pack_co2_vol numeric,
  pack_do_ppb numeric,
  unders text,
  stock_venue_kegs integer,
  stock_venue_cartons integer,
  stock_options_kegs integer,
  stock_options_cartons integer,
  stock_sales_kegs integer,
  stock_sales_cartons integer,
  notes text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table packaging_reports enable row level security;
create policy "authenticated read" on packaging_reports for select using (auth.role() = 'authenticated');
create policy "brewer insert packaging reports" on packaging_reports for insert with check ((select get_my_role()) = any (array['admin','brewer']));
create policy "brewer update packaging reports" on packaging_reports for update using ((select get_my_role()) = any (array['admin','brewer'])) with check ((select get_my_role()) = any (array['admin','brewer']));
