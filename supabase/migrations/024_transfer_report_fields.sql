-- Transfer report fields matching the physical paper form
alter table transfers
  add column if not exists brite_cooling_on       boolean,
  add column if not exists fv_temp_pre_c          numeric(5,2),
  add column if not exists brite_temp_pre_c       numeric(5,2),
  add column if not exists purge_start            text,   -- "HH:MM"
  add column if not exists purge_finish           text,
  add column if not exists transfer_start         text,
  add column if not exists transfer_finish        text,
  add column if not exists brite_temp_post_c      numeric(5,2),
  add column if not exists brite_pressure_psi     numeric(5,2),
  add column if not exists initial_carb_performed boolean,
  add column if not exists fv_cooling_off         boolean;
