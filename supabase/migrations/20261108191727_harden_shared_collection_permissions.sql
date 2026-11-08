-- Follow-up hardening for shared collections.
-- Accepting an invitation no longer needs SECURITY DEFINER: narrowly-scoped
-- INSERT/UPDATE grants plus RLS are sufficient.

grant insert on public.collection_members to authenticated;

create policy "collection_members: insert matching invitation"
  on public.collection_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.collection_invites ci
      where ci.collection_id = collection_members.collection_id
        and ci.role = collection_members.role
        and ci.invited_by = collection_members.invited_by
        and ci.accepted_at is null
        and lower(ci.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    )
  );

drop policy "collection_invites: select owner or recipient" on public.collection_invites;
create policy "collection_invites: select owner or recipient"
  on public.collection_invites for select to authenticated
  using (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

drop policy "collection_invites: update owner" on public.collection_invites;
drop policy "collection_invites: delete owner or recipient" on public.collection_invites;

revoke update on public.collection_invites from authenticated;
grant update (accepted_by, accepted_at) on public.collection_invites to authenticated;

create policy "collection_invites: accept recipient"
  on public.collection_invites for update to authenticated
  using (
    accepted_at is null
    and lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  )
  with check (
    accepted_by = (select auth.uid())
    and accepted_at is not null
    and lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create policy "collection_invites: delete owner or recipient"
  on public.collection_invites for delete to authenticated
  using (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

create or replace function public.accept_collection_invites()
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if caller is null or caller_email = '' then
    raise exception 'An authenticated account with an email is required';
  end if;

  insert into public.collection_members (collection_id, user_id, role, invited_by)
  select ci.collection_id, caller, ci.role, ci.invited_by
  from public.collection_invites ci
  where lower(ci.email) = caller_email and ci.accepted_at is null
  on conflict (collection_id, user_id) do nothing;

  return query
  update public.collection_invites ci
  set accepted_at = now(), accepted_by = caller
  where lower(ci.email) = caller_email and ci.accepted_at is null
  returning ci.collection_id;
end;
$$;

create index collection_members_invited_by_idx on public.collection_members (invited_by);
create index collection_invites_invited_by_idx on public.collection_invites (invited_by);
create index collection_invites_accepted_by_idx on public.collection_invites (accepted_by) where accepted_by is not null;
