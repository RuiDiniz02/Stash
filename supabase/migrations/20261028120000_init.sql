-- Stash — initial schema
-- Tables: profiles, entries, collections, entry_collections, tags, entry_tags, attachments, reminders
-- Every row is owned by exactly one user and protected by Row Level Security.
-- Child tables use composite foreign keys (id, user_id) so a row can never point at
-- another user's entry/collection/tag, even though FK checks bypass RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  accent text not null default 'indigo'
    check (accent in ('indigo', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'graphite')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Entries
-- ---------------------------------------------------------------------------
create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'note'
    check (kind in ('note', 'link', 'image', 'video', 'audio', 'file', 'mixed')),
  title text check (char_length(title) <= 300),
  body text check (char_length(body) <= 50000),
  description text check (char_length(description) <= 5000),
  url text check (char_length(url) <= 4096),
  link_preview jsonb,
  is_pinned boolean not null default false,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(link_preview ->> 'title', '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(url, '')), 'D')
  ) stored,
  unique (id, user_id)
);

create index entries_user_created_idx on public.entries (user_id, created_at desc);
create index entries_user_pinned_idx on public.entries (user_id) where is_pinned;
create index entries_fts_idx on public.entries using gin (fts);

create trigger entries_updated_at before update on public.entries
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Collections
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  icon text check (char_length(icon) <= 40),
  color text check (char_length(color) <= 20),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index collections_user_name_idx on public.collections (user_id, lower(name));
create index collections_user_position_idx on public.collections (user_id, position);

create trigger collections_updated_at before update on public.collections
  for each row execute function private.set_updated_at();

create table public.entry_collections (
  entry_id uuid not null,
  collection_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, collection_id),
  foreign key (entry_id, user_id) references public.entries (id, user_id) on delete cascade,
  foreign key (collection_id, user_id) references public.collections (id, user_id) on delete cascade
);

create index entry_collections_collection_idx on public.entry_collections (collection_id);
create index entry_collections_user_idx on public.entry_collections (user_id);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.entry_tags (
  entry_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, tag_id),
  foreign key (entry_id, user_id) references public.entries (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index entry_tags_tag_idx on public.entry_tags (tag_id);
create index entry_tags_user_idx on public.entry_tags (user_id);

-- ---------------------------------------------------------------------------
-- Attachments (files live in the private "stash" Storage bucket)
-- ---------------------------------------------------------------------------
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique check (split_part(storage_path, '/', 1) = user_id::text),
  kind text not null check (kind in ('image', 'video', 'audio', 'file')),
  mime_type text check (char_length(mime_type) <= 200),
  file_name text check (char_length(file_name) <= 500),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  width integer,
  height integer,
  duration_seconds numeric,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.entries (id, user_id) on delete cascade
);

create index attachments_entry_idx on public.attachments (entry_id);
create index attachments_user_kind_idx on public.attachments (user_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  notes text check (char_length(notes) <= 5000),
  due_at timestamptz not null,
  all_day boolean not null default false,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (entry_id, user_id) references public.entries (id, user_id) on delete set null (entry_id)
);

create index reminders_user_due_idx on public.reminders (user_id, due_at);
create index reminders_entry_idx on public.reminders (entry_id);

create trigger reminders_updated_at before update on public.reminders
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.collections enable row level security;
alter table public.entry_collections enable row level security;
alter table public.tags enable row level security;
alter table public.entry_tags enable row level security;
alter table public.attachments enable row level security;
alter table public.reminders enable row level security;

-- profiles: keyed by id
create policy "profiles: select own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Owner-only CRUD for every user_id table
do $$
declare
  t text;
begin
  foreach t in array array['entries', 'collections', 'tags', 'attachments', 'reminders'] loop
    execute format('create policy "%1$s: select own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: update own" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: delete own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;

  foreach t in array array['entry_collections', 'entry_tags'] loop
    execute format('create policy "%1$s: select own" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: insert own" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "%1$s: delete own" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Data API exposure: authenticated users only, never anon.
-- (New Supabase projects no longer expose tables automatically.)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.entries, public.collections, public.entry_collections,
  public.tags, public.entry_tags, public.attachments, public.reminders from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.entries, public.collections, public.tags,
  public.attachments, public.reminders to authenticated;
grant select, insert, delete on public.entry_collections, public.entry_tags to authenticated;

-- ---------------------------------------------------------------------------
-- Search (security invoker: RLS still applies)
-- ---------------------------------------------------------------------------
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
  where e.user_id = (select auth.uid())
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

revoke execute on function public.search_entries(text, text[], uuid, text, boolean, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.search_entries(text, text[], uuid, text, boolean, boolean, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion — deletes ONLY the calling user. All public rows cascade.
-- Storage files must be removed first through the Storage API (the app does this).
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, files stored under "<user_id>/<entry_id>/<file>"
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('stash', 'stash', false, 52428800)
on conflict (id) do nothing;

create policy "stash: owners read" on storage.objects for select to authenticated
  using (bucket_id = 'stash' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stash: owners upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'stash' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stash: owners update" on storage.objects for update to authenticated
  using (bucket_id = 'stash' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'stash' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "stash: owners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stash' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Realtime (cross-device sync). Postgres Changes respect RLS.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.entries, public.attachments, public.collections, public.entry_collections,
  public.tags, public.entry_tags, public.reminders;
