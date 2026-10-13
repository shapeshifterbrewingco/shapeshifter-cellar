-- The target a batch was brewed to, kept on the batch so a later recipe change
-- does not rewrite history. Null falls back to the linked recipe.
alter table public.brews
  add column if not exists target_og_plato numeric,
  add column if not exists target_abv numeric;
