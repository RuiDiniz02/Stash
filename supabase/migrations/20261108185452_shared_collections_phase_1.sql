-- Stash v1.4 — shared collections, phase 1
--
-- Existing collections remain private by default. A collection becomes shared only
-- after its owner creates an invitation. Collaborators can view the collection;
-- editors can add/remove entries, while every entry keeps its original owner.

-- ---------------------------------------------------------------------------
-- Membership and invitations
-- ---------------------------------------------------------------------------
create table public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index collection_members_user_idx on public.collection_members (user_id, collection_id);

create table public.collection_invites (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  email text not null check (
    char_length(btrim(email)) between 3 and 320
    and email = lower(btrim(email))
  ),
  role text not null check (role in ('editor', 'viewer')),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index collection_invites_pending_email_idx
  on public.collection_invites (collection_id, lower(email))
  where accepted_at is null;
create index collection_invites_email_idx
  on public.collection_invites (lower(email))
  where accepted_at is null;

-- Helpers live outside the exposed API schema and bypass table RLS only to answer
-- a narrow authorization question. They never return collection contents.
create or replace function private.collection_role(
  target_collection uuid,
  target_user uuid default auth.uid()
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when c.user_id = target_user then 'owner'
    else (
      select cm.role
      from public.collection_members cm
      where cm.collection_id = c.id and cm.user_id = target_user
    )
  end
  from public.collections c
  where c.id = target_collection
$$;

create or replace function private.can_view_entry(
  target_entry uuid,
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entries e
    where e.id = target_entry
      and (
        e.user_id = target_user
        or exists (
          select 1
          from public.entry_collections ec
          where ec.entry_id = e.id
            and private.collection_role(ec.collection_id, target_user) is not null
        )
      )
  )
$$;

create or replace function private.shares_collection_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.collections c
    where private.collection_role(c.id, auth.uid()) is not null
      and private.collection_role(c.id, other_user) is not null
  )
$$;

revoke all on function private.collection_role(uuid, uuid) from public, anon;
revoke all on function private.can_view_entry(uuid, uuid) from public, anon;
revoke all on function private.shares_collection_with(uuid) from public, anon;
grant execute on function private.collection_role(uuid, uuid) to authenticated;
grant execute on function private.can_view_entry(uuid, uuid) to authenticated;
grant execute on function private.shares_collection_with(uuid) to authenticated;

alter table public.collection_members enable row level security;
alter table public.collection_invites enable row level security;

revoke all on public.collection_members, public.collection_invites from anon, authenticated;
grant select, update, delete on public.collection_members to authenticated;
grant select, insert, update, delete on public.collection_invites to authenticated;

create policy "collection_members: select space members"
  on public.collection_members for select to authenticated
  using (private.collection_role(collection_id, (select auth.uid())) is not null);

create policy "collection_members: update owner"
  on public.collection_members for update to authenticated
  using (private.collection_role(collection_id, (select auth.uid())) = 'owner')
  with check (private.collection_role(collection_id, (select auth.uid())) = 'owner');

create policy "collection_members: delete owner or self"
  on public.collection_members for delete to authenticated
  using (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    or user_id = (select auth.uid())
  );

create policy "collection_invites: select owner or recipient"
  on public.collection_invites for select to authenticated
  using (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

create policy "collection_invites: insert owner"
  on public.collection_invites for insert to authenticated
  with check (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    and invited_by = (select auth.uid())
    and accepted_at is null
    and accepted_by is null
  );

create policy "collection_invites: update owner"
  on public.collection_invites for update to authenticated
  using (private.collection_role(collection_id, (select auth.uid())) = 'owner')
  with check (private.collection_role(collection_id, (select auth.uid())) = 'owner');

create policy "collection_invites: delete owner or recipient"
  on public.collection_invites for delete to authenticated
  using (
    private.collection_role(collection_id, (select auth.uid())) = 'owner'
    or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

-- Accept every pending invitation addressed to the signed-in account. The
-- security-definer boundary is required because clients cannot insert arbitrary
-- membership rows; the function validates both auth.uid() and the trusted email
-- claim before doing so.
create or replace function public.accept_collection_invites()
returns setof uuid
language plpgsql
security definer
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
  on conflict (collection_id, user_id) do update
    set role = excluded.role;

  return query
  update public.collection_invites ci
  set accepted_at = now(), accepted_by = caller
  where lower(ci.email) = caller_email and ci.accepted_at is null
  returning ci.collection_id;
end;
$$;

revoke all on function public.accept_collection_invites() from public, anon;
grant execute on function public.accept_collection_invites() to authenticated;

-- ---------------------------------------------------------------------------
-- Allow a collection to contain entries owned by different members
-- ---------------------------------------------------------------------------
alter table public.entry_collections
  drop constraint entry_collections_entry_id_user_id_fkey,
  drop constraint entry_collections_collection_id_user_id_fkey;

alter table public.entry_collections
  add constraint entry_collections_entry_id_fkey
    foreign key (entry_id) references public.entries (id) on delete cascade,
  add constraint entry_collections_collection_id_fkey
    foreign key (collection_id) references public.collections (id) on delete cascade;

-- Keep the existing user_id column as the entry owner's id so old clients and
-- the group↔collection triggers remain compatible.
create or replace function private.set_entry_collection_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select e.user_id into new.user_id from public.entries e where e.id = new.entry_id;
  if new.user_id is null then
    raise exception 'Entry not found';
  end if;
  return new;
end;
$$;

create trigger entry_collections_set_owner
  before insert or update of entry_id on public.entry_collections
  for each row execute function private.set_entry_collection_owner();

drop policy "entry_collections: select own" on public.entry_collections;
drop policy "entry_collections: insert own" on public.entry_collections;
drop policy "entry_collections: delete own" on public.entry_collections;

create policy "entry_collections: select accessible"
  on public.entry_collections for select to authenticated
  using (private.collection_role(collection_id, (select auth.uid())) is not null);

create policy "entry_collections: insert editors"
  on public.entry_collections for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.collection_role(collection_id, (select auth.uid())) in ('owner', 'editor')
  );

create policy "entry_collections: delete editors"
  on public.entry_collections for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.collection_role(collection_id, (select auth.uid())) in ('owner', 'editor')
  );

-- Owners still see all their entries. Collaborators see an entry only while it
-- belongs to at least one collection they can access.
drop policy "entries: select own" on public.entries;
create policy "entries: select own or shared"
  on public.entries for select to authenticated
  using (private.can_view_entry(id, (select auth.uid())));

drop policy "collections: select own" on public.collections;
create policy "collections: select own or shared"
  on public.collections for select to authenticated
  using (private.collection_role(id, (select auth.uid())) is not null);

drop policy "attachments: select own" on public.attachments;
create policy "attachments: select own or shared"
  on public.attachments for select to authenticated
  using (private.can_view_entry(entry_id, (select auth.uid())));

drop policy "entry_tags: select own" on public.entry_tags;
create policy "entry_tags: select own or shared"
  on public.entry_tags for select to authenticated
  using (private.can_view_entry(entry_id, (select auth.uid())));

drop policy "tags: select own" on public.tags;
create policy "tags: select own or shared"
  on public.tags for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.entry_tags et
      where et.tag_id = id and private.can_view_entry(et.entry_id, (select auth.uid()))
    )
  );

drop policy "profiles: select own" on public.profiles;
create policy "profiles: select own or collaborator"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or private.shares_collection_with(id)
  );

-- Shared files remain private, but Storage may create a signed URL when the
-- caller can view the attachment's entry through a shared collection.
create policy "stash: select shared attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'stash'
    and exists (
      select 1
      from public.attachments a
      where a.storage_path = name
        and private.can_view_entry(a.entry_id, (select auth.uid()))
    )
  );

-- Collection views use this RPC. Personal searches remain personal; when a
-- collection is supplied, RLS and its membership join admit shared entries.
create or replace function public.search_entries(
  q text default null,
  kinds text[] default null,
  collection uuid default null,
  tag text default null,
  favorites_only boolean default false,
  include_archived boolean default false,
  date_from timestamptz default null,
  date_to timestamptz default null
)
returns setof public.entries
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.entries e
  cross join lateral (
    select
      nullif(btrim(q), '') as term,
      '%' || replace(replace(replace(coalesce(btrim(q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ) s
  where (collection is not null or e.user_id = (select auth.uid()))
    and (include_archived or not e.is_archived)
    and (not favorites_only or e.is_favorite)
    and (kinds is null or e.kind = any (kinds))
    and (date_from is null or e.created_at >= date_from)
    and (date_to is null or e.created_at < date_to)
    and (collection is null or exists (
      select 1 from public.entry_collections ec
      where ec.entry_id = e.id and ec.collection_id = collection))
    and (tag is null or exists (
      select 1 from public.entry_tags et join public.tags t on t.id = et.tag_id
      where et.entry_id = e.id and lower(t.name) = lower(tag)))
    and (
      s.term is null
      or e.fts @@ websearch_to_tsquery('simple', s.term)
      or e.title ilike s.pat
      or e.body ilike s.pat
      or e.description ilike s.pat
      or e.url ilike s.pat
      or (e.link_preview ->> 'title') ilike s.pat
      or (e.link_preview ->> 'site_name') ilike s.pat
      or exists (
        select 1 from public.entry_tags et join public.tags t on t.id = et.tag_id
        where et.entry_id = e.id and t.name ilike s.pat)
      or exists (
        select 1 from public.entry_collections ec join public.collections c on c.id = ec.collection_id
        where ec.entry_id = e.id and c.name ilike s.pat)
      or exists (
        select 1 from public.attachments a
        where a.entry_id = e.id and a.file_name ilike s.pat)
    );
$$;

-- Realtime tables for membership changes. Existing collection and entry tables
-- are already part of this publication.
alter publication supabase_realtime add table public.collection_members;
alter publication supabase_realtime add table public.collection_invites;
