-- Frigid asset IDs for direct setpoint control via POST /asset/target
alter table tanks
  add column if not exists frigid_asset_id text;

update tanks set frigid_asset_id = '9xAfexKCJT' where name = 'FV1';
update tanks set frigid_asset_id = 'qyy5tIBtAf' where name = 'FV2';
update tanks set frigid_asset_id = 'eTAB8aqqZd' where name = 'FV3';
update tanks set frigid_asset_id = 'Cc9PkJgbkU' where name = 'FV4';
update tanks set frigid_asset_id = 'Fs1BUCYXjb' where name = 'FV5';
update tanks set frigid_asset_id = 'Y6mIGow8z2' where name = 'FV6';
update tanks set frigid_asset_id = 'etbB23uopf' where name = 'FV7';
update tanks set frigid_asset_id = 'elTOICkw6J' where name = 'FV8';
update tanks set frigid_asset_id = 'FSl6npQo0v' where name = 'FV9';
update tanks set frigid_asset_id = '8hxQinj2wc' where name = 'FV10';
update tanks set frigid_asset_id = 'He3254B8DI' where name = 'FV11';
update tanks set frigid_asset_id = 'x3cPIXCMAx' where name = 'BBT A';
update tanks set frigid_asset_id = '8EhtXAvA5z' where name = 'BBT B';
