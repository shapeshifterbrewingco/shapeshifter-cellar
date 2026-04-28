-- ============================================================
-- 1. Link transfer/pack events back to their parent brew event
--    so deleting the brew cascades to linked events.
-- 2. Add 'confirmed' status (planned=red, confirmed=green).
-- ============================================================

-- Linked brew ID (self-referential FK with cascade)
alter table scheduled_brews
  add column if not exists linked_brew_id uuid
    references scheduled_brews(id) on delete cascade;

-- Expand the status check constraint to include 'confirmed'
alter table scheduled_brews
  drop constraint if exists scheduled_brews_status_check;

alter table scheduled_brews
  add constraint scheduled_brews_status_check
  check (status in ('planned','confirmed','brewing','done','cancelled'));
