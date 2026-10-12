-- Activity messages held for a few seconds so two actions on the same tank go to Slack as one.
-- Only the server (service role) reads or writes this, so RLS is on with no policies.
create table if not exists slack_outbox (
  id uuid primary key default gen_random_uuid(),
  group_key text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists slack_outbox_pending on slack_outbox (group_key, created_at) where sent_at is null;
alter table slack_outbox enable row level security;
