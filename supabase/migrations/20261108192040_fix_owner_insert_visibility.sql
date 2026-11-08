-- INSERT ... RETURNING evaluates SELECT policies while the just-created row is
-- not yet visible to a stable helper query. Keep the direct owner predicate so
-- personal creation behaves exactly as it did before collaboration.
drop policy "collections: select own or shared" on public.collections;
create policy "collections: select own or shared"
  on public.collections for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.collection_role(id, (select auth.uid())) is not null
  );

drop policy "entries: select own or shared" on public.entries;
create policy "entries: select own or shared"
  on public.entries for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_view_entry(id, (select auth.uid()))
  );
