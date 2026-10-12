-- Sample temperature taken with a manual reading (quick log screen)
alter table gravity_readings add column if not exists temperature_c numeric(5,2);
