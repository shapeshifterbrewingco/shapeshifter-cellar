-- Add excise / canning fields to packaging_splits
alter table packaging_splits
  add column if not exists abv              numeric       null,
  add column if not exists excise_category  text          null
    check (excise_category in ('standard', 'rtd', 'mid_strength')),
  add column if not exists clip_colour      text          null,
  add column if not exists collars_on_site  integer       not null default 0,
  add column if not exists decals_on_site   integer       not null default 0;

-- Add excise rates + SA Canning rates to app_settings
alter table app_settings
  add column if not exists excise_rate_can_std  numeric not null default 63.75,
  add column if not exists excise_rate_keg_std  numeric not null default 43.39,
  add column if not exists excise_rate_rtd      numeric not null default 107.99,
  add column if not exists excise_rate_keg_mid  numeric not null default 33.11,
  add column if not exists sa_canning_rate_375  numeric null,
  add column if not exists sa_canning_rate_440  numeric null;
