-- ============================================================
-- 002: Ingredient favourites + unique name + brewer style insert
-- ============================================================

-- Allow brewers to insert new custom styles
create policy "brewer insert styles" on beer_styles
  for insert with check (get_my_role() in ('admin', 'brewer'));

-- Favourite flag on master ingredient list
alter table ingredients
  add column is_favourite boolean not null default false;

-- Unique constraint on ingredient name for safe upsert
alter table ingredients
  add constraint ingredients_name_unique unique (name);
