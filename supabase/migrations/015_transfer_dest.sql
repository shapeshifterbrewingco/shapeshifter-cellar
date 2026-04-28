-- Destination tank for transfer events.
-- When a transfer event is saved with a dest_tank_id, the server
-- action syncs the linked pack event's tank_id to match.

alter table scheduled_brews
  add column if not exists dest_tank_id uuid references tanks(id) on delete set null;
