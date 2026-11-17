-- Replace the URL with the Supabase API origin for this deployment.
do $$
declare
  project_url text := 'https://YOUR_PROJECT.supabase.co';
  url_secret uuid;
begin
  if project_url !~ '^https://[a-z0-9]+[.]supabase[.]co$' then
    raise exception 'Set project_url to the Supabase API origin first';
  end if;

  select id into url_secret from vault.secrets where name = 'stash_reminder_project_url';
  if url_secret is null then
    perform vault.create_secret(project_url, 'stash_reminder_project_url');
  else
    perform vault.update_secret(url_secret, project_url);
  end if;
  if not exists (select 1 from vault.secrets where name = 'stash_reminder_dispatch_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'stash_reminder_dispatch_token');
  end if;

  perform cron.schedule('stash-reminder-push', '* * * * *', 'select stash_private.dispatch_reminder_pushes()');
  perform cron.schedule('stash-prune-push-deliveries', '29 3 * * *',
    'delete from public.reminder_push_deliveries where due_at < now() - interval ''7 days''');
end;
$$;

-- Initialize the VAPID keys and verify the sender before waiting on the first cron tick.
select stash_private.dispatch_reminder_pushes() as dispatch_request_id;
