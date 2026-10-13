-- 20 L PET kegs (export) are a pack format of their own.
alter table packaging_runs drop constraint packaging_runs_format_check,
  add constraint packaging_runs_format_check check (format = any (array['24x375','16x440','keg20','keg30','keg50']));
