-- Single-row app-wide settings table
create table if not exists app_settings (
  id                    integer primary key default 1 check (id = 1),
  diacetyl_rest_temp_c  numeric  not null default 21,
  on_chill_temp_c       numeric  not null default 2,
  ale_weeks             integer  not null default 4,
  lager_weeks           integer  not null default 6,
  default_hop_load      text     not null default 'medium'
                          check (default_hop_load in ('low', 'medium', 'high')),
  default_brew_volume_l numeric  null,
  updated_at            timestamptz not null default now()
);

-- Seed the single row
insert into app_settings (id) values (1) on conflict do nothing;
