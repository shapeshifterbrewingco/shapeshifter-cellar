-- ============================================================
-- Mark utility tanks (HLT, CLT, Glycol) so they don't render
-- as fermenter/brite cards on the cellar dashboard.
-- ============================================================

alter table tanks add column if not exists is_utility boolean not null default false;

-- Mark the three utility tanks by their canonical names.
-- If your tank names differ, update accordingly.
update tanks set is_utility = true
where name ilike '%hot liquor%'
   or name ilike '%cold liquor%'
   or name ilike '%glycol%';
