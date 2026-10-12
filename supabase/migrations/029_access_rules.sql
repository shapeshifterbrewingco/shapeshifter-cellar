-- Access rules missing since the app was first set up (applied 12 Oct 2026).
-- Additive only: nothing is dropped.

create policy "authenticated read settings" on app_settings
  for select to authenticated using (true);
create policy "brewer write settings" on app_settings
  for all to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));

create policy "brewer update gravity" on gravity_readings
  for update to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));
create policy "brewer delete gravity" on gravity_readings
  for delete to authenticated using ((select get_my_role()) in ('admin', 'brewer'));

create policy "brewer update packaging" on packaging_runs
  for update to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));
create policy "brewer delete packaging" on packaging_runs
  for delete to authenticated using ((select get_my_role()) in ('admin', 'brewer'));

create policy "brewer delete transfers" on transfers
  for delete to authenticated using ((select get_my_role()) in ('admin', 'brewer'));
create policy "brewer delete stage history" on tank_stage_history
  for delete to authenticated using ((select get_my_role()) in ('admin', 'brewer'));
create policy "brewer delete vdk" on vdk_readings
  for delete to authenticated using ((select get_my_role()) in ('admin', 'brewer'));

create policy "brewer update tanks" on tanks
  for update to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));

-- One live brew per tank
create unique index if not exists brews_one_active_per_tank
  on brews (tank_id)
  where deleted_at is null and stage not in ('empty', 'transferred', 'packaged');

alter function get_my_role() set search_path = public;

create index if not exists idx_brews_active on brews (tank_id, deleted_at, stage) where deleted_at is null;
create index if not exists idx_gravity_brew_time on gravity_readings (brew_id, recorded_at desc);
create index if not exists idx_vdk_brew_time on vdk_readings (brew_id, recorded_at desc);
create index if not exists idx_packaging_splits_brew on packaging_splits (brew_id);
create index if not exists idx_scheduled_brews_tank_date on scheduled_brews (tank_id, scheduled_date) where status not in ('done', 'cancelled');
create index if not exists idx_packaging_runs_brew on packaging_runs (brew_id);
create index if not exists idx_transfers_brew on transfers (brew_id);
create index if not exists idx_recipe_ingredients_recipe on recipe_ingredients (recipe_id);
create index if not exists idx_recipe_ingredients_ingredient on recipe_ingredients (ingredient_id);
