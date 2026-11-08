-- A member may be invited again accidentally. Treat accepting that invitation as
-- a no-op for membership, then close the pending invitation normally.
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
  where lower(ci.email) = caller_email
    and ci.accepted_at is null
    and not exists (
      select 1
      from public.collection_members cm
      where cm.collection_id = ci.collection_id and cm.user_id = caller
    );

  return query
  update public.collection_invites ci
  set accepted_at = now(), accepted_by = caller
  where lower(ci.email) = caller_email and ci.accepted_at is null
  returning ci.collection_id;
end;
$$;
