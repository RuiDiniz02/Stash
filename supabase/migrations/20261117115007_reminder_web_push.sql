create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.reminder_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048 and endpoint like 'https://%'),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now()
);
create index reminder_push_devices_owner_idx on public.reminder_push_devices (user_id);
alter table public.reminder_push_devices enable row level security;
revoke all on public.reminder_push_devices from public, anon, authenticated;
grant select, insert, update, delete on public.reminder_push_devices to authenticated;
grant select, delete on public.reminder_push_devices to service_role;
create policy "Manage own push devices" on public.reminder_push_devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table public.reminder_push_config (
  id boolean primary key default true check (id),
  public_key text not null
);
alter table public.reminder_push_config enable row level security;
revoke all on public.reminder_push_config from public, anon, authenticated;
grant select on public.reminder_push_config to authenticated;
create policy "Read Web Push public key" on public.reminder_push_config for select to authenticated using (true);

create table public.reminder_push_deliveries (
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  device_id uuid not null references public.reminder_push_devices(id) on delete cascade,
  due_at timestamptz not null,
  attempts integer not null default 1,
  leased_until timestamptz not null default now() + interval '2 minutes',
  sent_at timestamptz,
  primary key (reminder_id, device_id, due_at)
);
create index reminder_push_deliveries_device_idx on public.reminder_push_deliveries (device_id);
create index reminder_push_deliveries_due_idx on public.reminder_push_deliveries (due_at);
create index reminders_pending_push_due_idx on public.reminders (due_at) where completed_at is null;
alter table public.reminder_push_deliveries enable row level security;
revoke all on public.reminder_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.reminder_push_deliveries to service_role;
grant select on public.reminders to service_role;

create function public.authorize_reminder_dispatch(candidate text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'stash_reminder_dispatch_token'
      and extensions.digest(decrypted_secret, 'sha256') = extensions.digest(candidate, 'sha256')
  );
$$;
revoke all on function public.authorize_reminder_dispatch(text) from public, anon, authenticated;
grant execute on function public.authorize_reminder_dispatch(text) to service_role;

create function public.reminder_vapid_keys(proposed jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare keys jsonb;
begin
  perform pg_advisory_xact_lock(73441928);
  select decrypted_secret::jsonb into keys from vault.decrypted_secrets where name = 'stash_reminder_vapid';
  if keys is null and proposed is not null then
    perform vault.create_secret(proposed::text, 'stash_reminder_vapid');
    insert into public.reminder_push_config (public_key) values (proposed->>'publicKey');
    keys := proposed;
  end if;
  return keys;
end;
$$;
revoke all on function public.reminder_vapid_keys(jsonb) from public, anon, authenticated;
grant execute on function public.reminder_vapid_keys(jsonb) to service_role;

create function public.claim_reminder_pushes()
returns table (reminder_id uuid, device_id uuid, due_at timestamptz, endpoint text, p256dh text, auth_key text)
language sql security invoker set search_path = '' as $$
  with ready as (
    select r.id as rid, d.id as did, r.due_at as scheduled_at
    from public.reminders r
    join public.reminder_push_devices d on d.user_id = r.user_id and d.created_at <= r.due_at
    left join public.reminder_push_deliveries sent on sent.reminder_id = r.id and sent.device_id = d.id and sent.due_at = r.due_at
    where r.completed_at is null and r.due_at between now() - interval '15 minutes' and now()
      and (sent.reminder_id is null or (sent.sent_at is null and sent.leased_until <= now() and sent.attempts < 3))
    order by r.due_at, r.id, d.id
    limit 80
  ), claimed as (
    insert into public.reminder_push_deliveries as delivery (reminder_id, device_id, due_at)
    select rid, did, scheduled_at from ready
    on conflict on constraint reminder_push_deliveries_pkey do update
      set leased_until = now() + interval '2 minutes', attempts = delivery.attempts + 1
      where delivery.sent_at is null and delivery.leased_until <= now() and delivery.attempts < 3
    returning delivery.reminder_id, delivery.device_id, delivery.due_at
  )
  select c.reminder_id, c.device_id, c.due_at, d.endpoint, d.p256dh, d.auth_key
  from claimed c join public.reminder_push_devices d on d.id = c.device_id;
$$;
revoke all on function public.claim_reminder_pushes() from public, anon, authenticated;
grant execute on function public.claim_reminder_pushes() to service_role;

create schema if not exists stash_private;
revoke all on schema stash_private from public, anon, authenticated;
create function stash_private.dispatch_reminder_pushes()
returns bigint language sql security invoker set search_path = '' as $$
  select net.http_post(
    url := config.decrypted_secret || '/functions/v1/reminder-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Stash-Dispatch', token.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  from vault.decrypted_secrets config
  cross join vault.decrypted_secrets token
  where config.name = 'stash_reminder_project_url' and token.name = 'stash_reminder_dispatch_token'
    and (
      not exists (select 1 from public.reminder_push_config)
      or exists (
        select 1 from public.reminders r
        join public.reminder_push_devices d on d.user_id = r.user_id and d.created_at <= r.due_at
        left join public.reminder_push_deliveries sent on sent.reminder_id = r.id and sent.device_id = d.id and sent.due_at = r.due_at
        where r.completed_at is null and r.due_at between now() - interval '15 minutes' and now()
          and (sent.reminder_id is null or (sent.sent_at is null and sent.leased_until <= now() and sent.attempts < 3))
      )
    );
$$;
revoke all on function stash_private.dispatch_reminder_pushes() from public, anon, authenticated;
