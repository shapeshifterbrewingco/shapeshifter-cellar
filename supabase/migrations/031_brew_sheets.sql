-- The brew day record for a batch: everything on the front of the paper brew
-- sheet that is not already a reading. One per brew. The sheet's contents live
-- in `data` (shape defined in src/lib/brew-sheet.ts) so the form can grow
-- without a migration each time a line is added to the paper sheet.
create table if not exists brew_sheets (
  brew_id     uuid primary key references brews(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  -- 'app' = typed in on the day, 'photo' = read from a photo of the paper sheet
  source      text not null default 'app' check (source in ('app', 'photo', 'import')),
  -- Field paths read from a photo that a person has not yet confirmed
  unchecked   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table brew_sheets enable row level security;

create policy "authenticated read brew sheets" on brew_sheets
  for select to authenticated using (true);
create policy "brewer write brew sheets" on brew_sheets
  for all to authenticated
  using ((select get_my_role()) in ('admin', 'brewer'))
  with check ((select get_my_role()) in ('admin', 'brewer'));
