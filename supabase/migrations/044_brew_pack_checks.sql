-- Packaging materials ticked off for a batch: { cans: { by, at }, labels: {...} }.
-- A key is present when that item is done, so everyone sees the same ticks.
alter table public.brews
  add column if not exists pack_checks jsonb not null default '{}'::jsonb;
