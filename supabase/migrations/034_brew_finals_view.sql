-- One row per finished brew with the figures the History list needs, so the
-- list does not have to download every reading of every brew to show them.
-- security_invoker: the caller's own row-level rules apply, as on the tables.
create or replace view brew_finals with (security_invoker = true) as
select
  b.id as brew_id,
  (select g.plato from gravity_readings g where g.brew_id = b.id and g.plato is not null order by g.recorded_at desc limit 1) as final_plato,
  (select g.ph    from gravity_readings g where g.brew_id = b.id and g.ph    is not null order by g.recorded_at desc limit 1) as final_ph,
  (select count(*) from gravity_readings g where g.brew_id = b.id and (g.plato is not null or g.ph is not null))::int as reading_count,
  (select max(p.packaged_at) from packaging_runs p where p.brew_id = b.id) as packed_at,
  (select coalesce(sum(p.volume_l), 0) from packaging_runs p where p.brew_id = b.id) as packed_l
from brews b
where b.deleted_at is not null;

grant select on brew_finals to authenticated;
