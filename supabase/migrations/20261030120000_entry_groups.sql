-- Stash v1.1 — Inbox groups
-- A group bundles several entries into one idea without copying anything: entries point at
-- their group (one group per entry, no nesting). Ungrouping never deletes content.

create table public.entry_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index entry_groups_user_idx on public.entry_groups (user_id);

create trigger entry_groups_updated_at before update on public.entry_groups
  for each row execute function private.set_updated_at();

alter table public.entries add column group_id uuid;

-- Composite FK: an entry can only join a group owned by the same user.
alter table public.entries
  add constraint entries_group_fk foreign key (group_id, user_id)
  references public.entry_groups (id, user_id) on delete set null (group_id);

create index entries_group_idx on public.entries (group_id) where group_id is not null;

-- Remove a group as soon as its last entry leaves it (moved, ungrouped or deleted).
create or replace function private.delete_empty_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.group_id is not null
     and (tg_op = 'DELETE' or new.group_id is distinct from old.group_id)
     and not exists (select 1 from public.entries e where e.group_id = old.group_id) then
    delete from public.entry_groups g where g.id = old.group_id;
  end if;
  return null;
end;
$$;

create trigger entries_delete_empty_group
  after update of group_id or delete on public.entries
  for each row execute function private.delete_empty_group();

alter table public.entry_groups enable row level security;

create policy "entry_groups: select own" on public.entry_groups for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "entry_groups: insert own" on public.entry_groups for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "entry_groups: update own" on public.entry_groups for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "entry_groups: delete own" on public.entry_groups for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.entry_groups from anon;
grant select, insert, update, delete on public.entry_groups to authenticated;

alter publication supabase_realtime add table public.entry_groups;
