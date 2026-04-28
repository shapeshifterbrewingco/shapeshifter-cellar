-- Insert utility tanks into the tanks table so they get a DB ID for setpoint control.
-- is_utility = true keeps them off the main cellar dashboard.
insert into tanks (name, type, frigid_tank_name, frigid_asset_id, is_utility, sort_order)
values
  ('HLT',    'fermenter', 'HLT',    'A1',          true, 100),
  ('CLT',    'fermenter', 'CLT',    'pqxbBUUa08',  true, 101),
  ('Glycol', 'fermenter', 'Glycol', 'A2',           true, 102)
on conflict (name) do update set
  frigid_tank_name = excluded.frigid_tank_name,
  frigid_asset_id  = excluded.frigid_asset_id,
  is_utility       = true;
