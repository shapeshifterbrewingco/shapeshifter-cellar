-- Old paper sheets with no packaging report: the brew is on record, what it
-- packed is not. These sit in History under the month they were brewed and are
-- left out of yield, time in tank and volume.
alter table public.brews
  add column if not exists packaging_unrecorded boolean not null default false;
