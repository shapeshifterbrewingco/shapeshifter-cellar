-- Store the desired setpoint on tanks so the frigid-poll cron can't overwrite it
alter table tanks
  add column if not exists desired_set_point_c numeric;
