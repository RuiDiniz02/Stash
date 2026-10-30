-- Stash v1.2 — a named group is also a collection
-- When a group gets a name it is linked to a collection with that name. The database keeps the
-- collection's membership in step with the group: joining the group adds the entry to the
-- collection, leaving it removes it. Ungrouping (deleting the group) keeps the collection as is.

alter table public.entry_groups add column collection_id uuid;

alter table public.entry_groups
  add constraint entry_groups_collection_fk foreign key (collection_id, user_id)
  references public.collections (id, user_id) on delete set null (collection_id);

create index entry_groups_collection_idx on public.entry_groups (collection_id) where collection_id is not null;

-- Entry joins or leaves a linked group → mirror it in entry_collections.
-- Named so it fires before entries_delete_empty_group (triggers run in name order).
create or replace function private.sync_group_collection_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_collection uuid;
  new_collection uuid;
begin
  if tg_op = 'UPDATE' and old.group_id is not null and old.group_id is distinct from new.group_id then
    select g.collection_id into old_collection from public.entry_groups g where g.id = old.group_id;
    if old_collection is not null then
      delete from public.entry_collections ec where ec.entry_id = old.id and ec.collection_id = old_collection;
    end if;
  end if;

  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id) then
    select g.collection_id into new_collection from public.entry_groups g where g.id = new.group_id;
    if new_collection is not null then
      insert into public.entry_collections (entry_id, collection_id, user_id)
      values (new.id, new_collection, new.user_id)
      on conflict do nothing;
    end if;
  end if;

  return null;
end;
$$;

create trigger entries_collection_sync
  after insert or update of group_id on public.entries
  for each row execute function private.sync_group_collection_entry();

-- Group gets linked to a collection → add the entries it already has.
create or replace function private.link_group_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.collection_id is not null and new.collection_id is distinct from old.collection_id then
    insert into public.entry_collections (entry_id, collection_id, user_id)
    select e.id, new.collection_id, e.user_id from public.entries e where e.group_id = new.id
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger entry_groups_link_collection
  after update of collection_id on public.entry_groups
  for each row execute function private.link_group_collection();
