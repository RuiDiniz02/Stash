"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, FileText, Hash, Image as ImageIcon, Link2, Mic, Paperclip, Search as SearchIcon, SlidersHorizontal, Star, StickyNote, Video, X } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { Chip, EmptyState, ErrorState, Spinner } from "@/components/ui/misc";
import { EntryFeed, FeedSkeleton } from "@/components/entries/entry-feed";
import { CollectionIcon } from "@/components/collections/collection-icon";
import { hasSearchCriteria, useSearch, type SearchParams } from "@/lib/data/search";
import { useCollections } from "@/lib/data/collections";
import { useTags } from "@/lib/data/tags";
import type { EntryKind } from "@/lib/types";

const KINDS: { value: EntryKind; label: string; icon: typeof StickyNote }[] = [
  { value: "note", label: "Notes", icon: StickyNote },
  { value: "link", label: "Links", icon: Link2 },
  { value: "image", label: "Images", icon: ImageIcon },
  { value: "video", label: "Videos", icon: Video },
  { value: "audio", label: "Audio", icon: Mic },
  { value: "file", label: "Files", icon: FileText },
  { value: "mixed", label: "Mixed", icon: Paperclip },
];

const RANGES: { value: SearchParams["range"]; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Past 7 days" },
  { value: "month", label: "Past 30 days" },
  { value: "year", label: "Past year" },
];

export default function SearchPage() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}

function Search() {
  const router = useRouter();
  const urlParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(urlParams.get("q") ?? "");
  const [q, setQ] = useState(text);
  const [kinds, setKinds] = useState<EntryKind[]>([]);
  const [collection, setCollection] = useState<string | null>(urlParams.get("collection"));
  const [tag, setTag] = useState<string | null>(urlParams.get("tag"));
  const [favorites, setFavorites] = useState(false);
  const [archived, setArchived] = useState(false);
  const [range, setRange] = useState<SearchParams["range"]>("any");
  const [showFilters, setShowFilters] = useState(false);
  const { data: collections } = useCollections();
  const { data: tags } = useTags();

  // Follow tag links from the sidebar while already on this page.
  useEffect(() => {
    setTag(urlParams.get("tag"));
    setCollection(urlParams.get("collection"));
  }, [urlParams]);

  useEffect(() => {
    const t = setTimeout(() => setQ(text), 180);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (tag) p.set("tag", tag);
    if (collection) p.set("collection", collection);
    // Keep an open entry panel open while the query changes.
    const entry = new URLSearchParams(window.location.search).get("entry");
    if (entry) p.set("entry", entry);
    const next = `/search${p.toString() ? `?${p}` : ""}`;
    if (next !== window.location.pathname + window.location.search) router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tag, collection]);

  const params = useMemo<SearchParams>(
    () => ({ q, kinds, collection, tag, favorites, archived, range }),
    [q, kinds, collection, tag, favorites, archived, range],
  );
  const { data, isLoading, isFetching, error, refetch } = useSearch(params);
  const active = hasSearchCriteria(params);

  const toggleKind = (k: EntryKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  return (
    <>
      <PageHeader title="Search" search={false}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            type="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search notes, links, tags, collections…"
            aria-label="Search"
            className="h-10 w-full rounded-xl bg-muted pr-10 pl-10 text-[16px] outline-none transition focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-primary/15 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {isFetching ? (
            <Spinner className="absolute top-1/2 right-3.5 -translate-y-1/2" />
          ) : (
            text && (
              <button
                onClick={() => {
                  setText("");
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-accent"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )
          )}
        </div>
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
          <Chip active={showFilters} onClick={() => setShowFilters(!showFilters)} aria-label="More filters">
            <SlidersHorizontal /> Filters
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k.value} active={kinds.includes(k.value)} onClick={() => toggleKind(k.value)}>
              <k.icon /> {k.label}
            </Chip>
          ))}
        </div>
        {(showFilters || favorites || archived || range !== "any" || collection || tag) && (
        <div className="-mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
          <Chip active={favorites} onClick={() => setFavorites(!favorites)}>
            <Star /> Favorites
          </Chip>
          <Chip active={archived} onClick={() => setArchived(!archived)}>
            <Archive /> Include archived
          </Chip>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as SearchParams["range"])}
            aria-label="Date range"
            className="h-8 shrink-0 rounded-full border bg-card px-3 text-[13px] text-muted-foreground outline-none"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={collection ?? ""}
            onChange={(e) => setCollection(e.target.value || null)}
            aria-label="Collection"
            className="h-8 max-w-48 shrink-0 rounded-full border bg-card px-3 text-[13px] text-muted-foreground outline-none"
          >
            <option value="">All collections</option>
            {collections?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {tag && (
            <Chip active onClick={() => setTag(null)} aria-label={`Remove tag filter ${tag}`}>
              <Hash /> {tag} <X />
            </Chip>
          )}
        </div>
        )}
      </PageHeader>

      <div className="mx-auto max-w-2xl px-4 pt-4 md:px-8">
        {!active && (
          <div className="space-y-8 animate-fade-up">
            {!!collections?.length && (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Collections</h2>
                <div className="flex flex-wrap gap-2">
                  {collections.map((c) => (
                    <Link key={c.id} href={`/collections/${c.id}`} className="inline-flex h-9 items-center gap-2 rounded-xl border bg-card pr-3 pl-1.5 text-sm hover:bg-accent">
                      <CollectionIcon icon={c.icon} color={c.color} size="sm" className="size-6" />
                      {c.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {!!tags?.length && (
              <section>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tags</h2>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button key={t.id} onClick={() => setTag(t.name)} className="inline-flex items-center gap-0.5 rounded-lg bg-muted px-2 py-1 text-sm hover:bg-accent">
                      <Hash className="size-3.5 text-muted-foreground" />
                      {t.name}
                      <span className="ml-1 text-xs text-muted-foreground">{t.count}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!collections?.length && !tags?.length && (
              <EmptyState icon={SearchIcon} title="Find anything" description="Search across titles, notes, descriptions, links, tags, collections and file names." />
            )}
          </div>
        )}
        {active && isLoading && <FeedSkeleton />}
        {active && error && <ErrorState error={error} onRetry={() => refetch()} />}
        {active && data && (
          <>
            <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
              {data.length === 100 ? "100+ results" : `${data.length} result${data.length === 1 ? "" : "s"}`}
            </p>
            {data.length === 0 ? (
              <EmptyState icon={SearchIcon} title="No matches" description="Try fewer words or remove a filter." />
            ) : (
              <EntryFeed entries={data} layout="list" grouped />
            )}
          </>
        )}
      </div>
    </>
  );
}
