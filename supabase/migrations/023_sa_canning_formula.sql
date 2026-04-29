-- Replace per-can SA Canning rates with the real formula:
-- cost per can = (volume_ml / 1000) * rate_per_l + rate_per_end
alter table app_settings
  add column if not exists sa_canning_rate_per_l   numeric not null default 0.99,
  add column if not exists sa_canning_rate_per_end numeric not null default 0.069;

-- Drop old per-can columns added in migration 022
alter table app_settings
  drop column if exists sa_canning_rate_375,
  drop column if exists sa_canning_rate_440;
