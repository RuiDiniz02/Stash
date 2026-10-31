"use client";

import Link from "next/link";
import { Archive, CheckSquare, Pin, Settings, Star, Tag, Inbox as InboxIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { QuickComposer } from "@/components/capture/quick-composer";
import { EntriesView, LayoutToggle, useLayoutPref } from "@/components/entries/entries-view";
import { SelectionProvider, useSelection } from "@/components/entries/selection";
import { Chip } from "@/components/ui/misc";
import { useLocalState } from "@/hooks/use-local-state";
import type { EntryView } from "@/lib/data/entries";
import { cn } from "@/lib/utils";
import { VERSION_LABEL } from "@/lib/version";

const VIEWS: { value: EntryView; label: string; icon: typeof InboxIcon }[] = [
  { value: "inbox", label: "All", icon: InboxIcon },
  { value: "pinned", label: "Pinned", icon: Pin },
  { value: "favorites", label: "Favorites", icon: Star },
  { value: "uncategorized", label: "Unsorted", icon: Tag },
  { value: "archived", label: "Archive", icon: Archive },
];

export default function InboxPage() {
  return (
    <SelectionProvider>
      <Inbox />
    </SelectionProvider>
  );
}

function Inbox() {
  const [layout, setLayout] = useLayoutPref("inbox");
  const [view, setView] = useLocalState<EntryView>("stash-inbox-view", "inbox");
  const selection = useSelection()!;

  return (
    <>
      <PageHeader
        title="Inbox"
        actions={
          <>
            <button
              onClick={() => (selection.active ? selection.clear() : selection.start())}
              aria-pressed={selection.active}
              aria-label={selection.active ? "Done selecting" : "Select entries"}
              title="Select"
              className={cn(
                "grid size-9 place-items-center rounded-lg hover:bg-accent",
                selection.active ? "bg-primary-soft text-primary" : "text-muted-foreground",
              )}
            >
              <CheckSquare className="size-[18px]" />
            </button>
            <LayoutToggle value={layout} onChange={setLayout} />
            <Link href="/settings" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent md:hidden" aria-label="Settings">
              <Settings className="size-[18px]" />
            </Link>
          </>
        }
      />
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className={layout === "list" ? "mx-auto max-w-2xl" : undefined}>
          <div className="-mx-4 mt-3 mb-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0" role="tablist" aria-label="Filter">
            {VIEWS.map((v) => (
              <Chip
                key={v.value}
                role="tab"
                aria-selected={view === v.value}
                aria-pressed={undefined}
                active={view === v.value}
                onClick={() => setView(v.value)}
              >
                <v.icon />
                {v.label}
              </Chip>
            ))}
          </div>
          <EntriesView filter={{ view }} layout={layout} showPinnedStrip={view === "inbox" && !selection.active} />
          {/* Desktop shows the version in the sidebar footer. */}
          <p className="py-6 text-center text-[11px] text-muted-foreground/60 tabular-nums md:hidden">Stash {VERSION_LABEL}</p>
        </div>
      </div>
      {!selection.active && <QuickComposer docked />}
    </>
  );
}
