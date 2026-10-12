-- Log tank temperatures every 10 minutes, whether or not anyone has the app open
-- (applied 12 Oct 2026). The database calls the app's poller; the poller reads
-- Frigid and stores the readings. The shared secret lives in Supabase Vault
-- under the name 'cron_secret' and is read at call time, so it is never written
-- into this job. It must match CRON_SECRET in Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'frigid-poll',
  '*/10 * * * *',
  $job$
  select net.http_get(
    url := 'https://shapeshifter-cellar.vercel.app/api/frigid-poll',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1), 'not-set')
    ),
    timeout_milliseconds := 20000
  );
  $job$
);
