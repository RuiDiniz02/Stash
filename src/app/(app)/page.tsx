"use client";

import Link from "next/link";
import { Archive, Images, Pin, Settings, Star, Tag, Inbox as InboxIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { QuickComposer } from "@/components/capture/quick-composer";
import { EntriesView, LayoutToggle, useLayoutPref } from "@/components/entries/entries-view";
import { Chip } from "@/components/ui/misc";
import { useLocalState } from "@/hooks/use-local-state";
import type { EntryView } from "@/lib/data/entries";

const VIEWS: { value: EntryView; label: string; icon: typeof InboxIcon }[] = [
  { value: "inbox", label: "All", icon: InboxIcon },
  { value: "pinned", label: "Pinned", icon: Pin },
  { value: "favorites", label: "Favorites", icon: Star },
  { value: "uncategorized", label: "Uncategorized", icon: Tag },
  { value: "archived", label: "Archived", icon: Archive },
];

export default function InboxPage() {
  const [layout, setLayout] = useLayoutPref("inbox");
  const [view, setView] = useLocalState<EntryView>("stash-inbox-view", "inbox");

  return (
    <>
      <PageHeader
        title="Inbox"
        actions={
          <>
            <LayoutToggle value={layout} onChange={setLayout} />
            <Link href="/media" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent md:hidden" aria-label="Media library">
              <Images className="size-[18px]" />
            </Link>
            <Link href="/settings" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent md:hidden" aria-label="Settings">
              <Settings className="size-[18px]" />
            </Link>
          </>
        }
      />
      <div className="mx-auto max-w-5xl px-4 md:px-8">
        <div className={layout === "list" ? "mx-auto max-w-2xl" : undefined}>
          <div className="pt-3">
            <QuickComposer />
          </div>
          <div className="-mx-4 mt-3 mb-5 flex gap-1.5 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0" role="tablist" aria-label="Filter">
            {VIEWS.map((v) => (
              <Chip key={v.value} role="tab" aria-selected={view === v.value} active={view === v.value} onClick={() => setView(v.value)}>
                <v.icon />
                {v.label}
              </Chip>
            ))}
          </div>
          <EntriesView filter={{ view }} layout={layout} showPinnedStrip={view === "inbox"} />
        </div>
      </div>
    </>
  );
}
