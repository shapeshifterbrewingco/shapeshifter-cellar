-- Allow packaging splits to be linked to a scheduled pack event
-- (in addition to or instead of an actual brew)

alter table packaging_splits alter column brew_id drop not null;

alter table packaging_splits
  add column if not exists scheduled_brew_id uuid
  references scheduled_brews(id) on delete set null;

-- Unique index per scheduled brew (partial, only when set)
create unique index if not exists packaging_splits_scheduled_brew_id_key
  on packaging_splits(scheduled_brew_id)
  where scheduled_brew_id is not null;

-- At least one of brew_id or scheduled_brew_id must be present
alter table packaging_splits
  add constraint packaging_splits_has_link
  check (brew_id is not null or scheduled_brew_id is not null);
