-- ============================================================
-- Add event_type and brew_type to scheduled_brews
-- event_type: brew (red) | pack (blue) | transfer (purple)
-- brew_type:  ale (4wk default) | lager (6wk default)
-- ============================================================

alter table scheduled_brews
  add column if not exists event_type text not null default 'brew'
    check (event_type in ('brew', 'pack', 'transfer')),
  add column if not exists brew_type text
    check (brew_type in ('ale', 'lager'));
