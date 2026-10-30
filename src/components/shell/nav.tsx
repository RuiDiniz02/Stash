"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  Hash,
  Images,
  Inbox,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { Kbd } from "@/components/ui/misc";
import { useCollections } from "@/lib/data/collections";
import { useTags } from "@/lib/data/tags";
import { useUser } from "@/lib/user-context";
import { cn, isMac } from "@/lib/utils";
import { VERSION_LABEL } from "@/lib/version";
import { useStash } from "./stash-context";
import { CollectionIcon } from "@/components/collections/collection-icon";

const NAV = [
  { href: "/", label: "Inbox", icon: Inbox },
  { href: "/media", label: "Media", icon: Images },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/search", label: "Search", icon: Search },
  { href: "/collections", label: "Collections", icon: Folder },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { openCapture } = useStash();
  const user = useUser();
  const { data: collections } = useCollections();
  const { data: tags } = useTags();
  const mod = typeof window !== "undefined" && isMac() ? "⌘" : "Ctrl";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-[252px]",
      )}
      aria-label="Sidebar"
    >
      <div className={cn("flex h-14 items-center px-4", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/" aria-label="Stash — go to Inbox" className="rounded-lg">
          {collapsed ? <LogoMark /> : <Logo />}
        </Link>
        {!collapsed && (
          <button
            onClick={onToggle}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Collapse sidebar"
            title="Collapse sidebar ( [ )"
          >
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => openCapture()}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 active:scale-[0.98]",
            collapsed ? "justify-center" : "px-3",
          )}
          aria-label="New capture"
          title="New capture (N)"
        >
          <Plus className="size-4" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">New capture</span>
              <Kbd className="border-white/20 bg-white/15 text-primary-foreground">N</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg text-sm transition-colors",
                collapsed ? "justify-center" : "px-2.5",
                active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
            >
              <Icon className="size-[18px]" />
              {!collapsed && <span className="flex-1">{label}</span>}
              {!collapsed && href === "/search" && <Kbd>{mod}K</Kbd>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4 scrollbar-none">
          <div className="mb-1 flex items-center justify-between px-2.5">
            <span className="text-xs font-medium text-muted-foreground">Collections</span>
            <Link href="/collections?new=1" className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="New collection">
              <Plus className="size-3.5" />
            </Link>
          </div>
          {collections?.length ? (
            collections.map((c) => {
              const href = `/collections/${c.id}`;
              const active = pathname === href;
              return (
                <Link
                  key={c.id}
                  href={href}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                    active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  )}
                >
                  <CollectionIcon icon={c.icon} color={c.color} size="sm" />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70">{c.entry_count || ""}</span>
                </Link>
              );
            })
          ) : (
            <p className="px-2.5 py-1 text-xs text-muted-foreground/70">No collections yet</p>
          )}

          {!!tags?.length && (
            <>
              <div className="mt-4 mb-1 px-2.5 text-xs font-medium text-muted-foreground">Tags</div>
              <div className="flex flex-wrap gap-1 px-2">
                {tags.slice(0, 24).map((t) => (
                  <Link
                    key={t.id}
                    href={`/search?tag=${encodeURIComponent(t.name)}`}
                    className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Hash className="size-3" />
                    {t.name}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className={cn("mt-auto border-t p-3", collapsed && "flex flex-col items-center gap-1")}>
        {collapsed && (
          <button
            onClick={onToggle}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Expand sidebar"
          >
            <ChevronsRight className="size-4" />
          </button>
        )}
        <Link
          href="/settings"
          title="Settings"
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-lg text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed ? "w-9 justify-center" : "px-2.5",
            pathname === "/settings" && "bg-accent text-foreground",
          )}
        >
          <Settings className="size-[18px]" />
          {!collapsed && <span className="flex-1 truncate">{user.email ?? "Settings"}</span>}
        </Link>
        <p className={cn("pt-1.5 text-[11px] text-muted-foreground/60 tabular-nums", !collapsed && "px-2.5")}>
          {collapsed ? VERSION_LABEL : `Stash ${VERSION_LABEL}`}
        </p>
      </div>
    </aside>
  );
}

const MOBILE_NAV = [
  { href: "/", label: "Inbox", icon: Inbox },
  { href: "/collections", label: "Collections", icon: Folder },
  null,
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/media", label: "Media", icon: Images },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { openCapture } = useStash();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-safe backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
        {MOBILE_NAV.map((item) =>
          item === null ? (
            <div key="capture" className="flex justify-center">
              <button
                onClick={() => openCapture()}
                aria-label="New capture"
                className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-float ring-4 ring-background transition active:scale-90"
              >
                <Plus className="size-6" strokeWidth={2.4} />
              </button>
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-1 text-[10.5px] font-medium transition-colors",
                isActive(pathname, item.href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={isActive(pathname, item.href) ? 2.2 : 1.8} />
              {item.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
  back,
  search = true,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  back?: React.ReactNode;
  /** Show the search icon that expands into a field. */
  search?: boolean;
}) {
  const [searching, setSearching] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 pt-safe backdrop-blur-xl backdrop-saturate-150 [&:has(+*)]:border-border/60">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:px-8">
        {searching ? (
          <HeaderSearchField onClose={() => setSearching(false)} />
        ) : (
          <>
            {back}
            <div className="min-w-0 flex-1">
              {back ? (
                <>
                  <h1 className="truncate text-[17px] font-semibold tracking-tight">{title}</h1>
                  {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
                </>
              ) : (
                <>
                  {/* Mobile: the logo takes the title spot and goes to the Inbox. */}
                  <Link href="/" aria-label="Stash — go to Inbox" className="inline-flex rounded-lg md:hidden">
                    <Logo />
                  </Link>
                  <h1 className="sr-only md:not-sr-only md:truncate md:text-[17px] md:font-semibold md:tracking-tight">{title}</h1>
                  {subtitle && <p className="hidden truncate text-xs text-muted-foreground md:block">{subtitle}</p>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {search && (
                <button
                  onClick={() => setSearching(true)}
                  aria-label="Search"
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Search className="size-[18px]" />
                </button>
              )}
              {actions}
            </div>
          </>
        )}
      </div>
      {children && <div className="mx-auto max-w-5xl px-4 pb-3 md:px-8">{children}</div>}
    </header>
  );
}

/** Inline search field that replaces the header title; Enter opens the results page. */
function HeaderSearchField({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="flex flex-1 items-center gap-2 animate-in fade-in-0 slide-in-from-right-2 duration-150"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search your stash"
          aria-label="Search your stash"
          className="h-10 w-full rounded-xl bg-muted pr-3 pl-9 text-[16px] outline-none focus-visible:ring-3 focus-visible:ring-primary/15 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      <button type="button" onClick={onClose} className="h-10 px-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        Cancel
      </button>
    </form>
  );
}
