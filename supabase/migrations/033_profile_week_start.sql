-- Each person's own choice of which day the calendar week starts on.
-- 0 = Sunday, 1 = Monday. A personal preference, so it lives on the profile,
-- not in the brewery-wide settings.
alter table profiles add column if not exists week_starts_on smallint not null default 1 check (week_starts_on in (0, 1));
