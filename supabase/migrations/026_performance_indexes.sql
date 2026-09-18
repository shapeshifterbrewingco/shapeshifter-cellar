-- Indexes for the columns hit on every dashboard load

-- Active brews lookup (filtered by deleted_at + stage constantly)
create index if not exists idx_brews_active
  on brews (tank_id, deleted_at, stage)
  where deleted_at is null;

-- Latest gravity per brew
create index if not exists idx_gravity_brew_time
  on gravity_readings (brew_id, recorded_at desc);

-- Latest temperature per tank
create index if not exists idx_temp_tank_time
  on temperature_readings (tank_id, recorded_at desc);

-- Latest VDK per brew
create index if not exists idx_vdk_brew_time
  on vdk_readings (brew_id, recorded_at desc);

-- Packaging splits by brew
create index if not exists idx_packaging_splits_brew
  on packaging_splits (brew_id);

-- Scheduled brews by tank + date (empty tank card lookup)
create index if not exists idx_scheduled_brews_tank_date
  on scheduled_brews (tank_id, scheduled_date)
  where status not in ('done', 'cancelled');
