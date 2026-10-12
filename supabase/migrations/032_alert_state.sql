-- Which alarms are currently live, so Slack hears about each one once when it
-- starts and once when it clears, not every time the poller runs.
-- Written only by the server (service role); no policies on purpose.
create table if not exists alert_state (
  key           text primary key,          -- e.g. 'off:<tank id>', 'frigid:down'
  first_seen_at timestamptz not null default now(),
  notified_at   timestamptz,               -- null until it has lasted long enough to post
  message       text not null default ''
);
alter table alert_state enable row level security;
