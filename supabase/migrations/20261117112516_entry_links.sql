create table public.entry_links (
  user_id uuid not null default auth.uid(),
  entry_a uuid not null,
  entry_b uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_a, entry_b),
  constraint entry_links_canonical_pair check (entry_a < entry_b),
  constraint entry_links_a_fk foreign key (entry_a, user_id) references public.entries (id, user_id) on delete cascade,
  constraint entry_links_b_fk foreign key (entry_b, user_id) references public.entries (id, user_id) on delete cascade
);

create index entry_links_b_idx on public.entry_links (user_id, entry_b);

alter table public.entry_links enable row level security;
revoke all on public.entry_links from public, anon, authenticated;
grant select, insert, delete on public.entry_links to authenticated;

create policy "Read own entry links" on public.entry_links
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "Create own entry links" on public.entry_links
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "Remove own entry links" on public.entry_links
  for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.entry_links;
