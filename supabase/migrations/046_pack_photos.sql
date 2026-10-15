-- Photos taken with a packaging report (usually a can next to the paper
-- report), and the Slack post the report went out as in #packagingreports.
-- Files sit in a private bucket. The app writes them with the service key after
-- checking the person is a brewer or admin; staff read them through signed URLs.

insert into storage.buckets (id, name, public)
values ('pack-photos', 'pack-photos', false)
on conflict (id) do nothing;

create table if not exists public.pack_photos (
  id uuid primary key default gen_random_uuid(),
  brew_id uuid not null references public.brews(id) on delete cascade,
  path text not null,
  -- Set once the photo is uploaded to Slack, so an edited report reuses it
  slack_file_id text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists pack_photos_brew on public.pack_photos (brew_id, created_at);

alter table public.pack_photos enable row level security;
drop policy if exists "authenticated read" on public.pack_photos;
create policy "authenticated read" on public.pack_photos for select using (auth.role() = 'authenticated');

-- The Slack message for this report, so edits update it instead of posting again
alter table public.packaging_reports add column if not exists slack_ts text;
