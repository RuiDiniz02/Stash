-- ON CONFLICT performs an additional visibility check on collection_members.
-- Before acceptance the invitee cannot yet select that membership row, so use a
-- plain insert guarded by the still-pending invitation instead.
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
    and ci.accepted_at is null;

  return query
  update public.collection_invites ci
  set accepted_at = now(), accepted_by = caller
  where lower(ci.email) = caller_email and ci.accepted_at is null
  returning ci.collection_id;
end;
$$;
