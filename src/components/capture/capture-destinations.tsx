"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { CollectionIcon } from "@/components/collections/collection-icon";
import type { Collection } from "@/lib/types";
import { cn } from "@/lib/utils";

export function isSharedDestination(collection: Collection) {
  return collection.access_role === "editor" || !!collection.member_count || !!collection.pending_invite_count;
}

export function CaptureDestinations({
  collections, selected, disabled, onSelect,
}: {
  collections: Collection[];
  selected?: string;
  disabled: boolean;
  onSelect: (id?: string) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });

  useEffect(() => {
    if (!wrapper.current || !rail.current || !items.current) return;
    const area = wrapper.current;
    const scroller = rail.current;
    const content = items.current;
    function update() {
      const next = {
        overflow: content.offsetWidth > area.clientWidth + 1,
        left: scroller.scrollLeft > 1,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
      };
      setEdges((prev) => prev.overflow === next.overflow && prev.left === next.left && prev.right === next.right ? prev : next);
    }
    const observer = new ResizeObserver(update);
    [area, scroller, content].forEach((node) => observer.observe(node));
    scroller.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); scroller.removeEventListener("scroll", update); };
  }, []);

  useEffect(() => {
    const node = rail.current;
    const active = node?.querySelector('button[aria-pressed="true"]');
    if (!node || !active) return;
    const viewport = node.getBoundingClientRect();
    const icon = active.getBoundingClientRect();
    const inset = 4;
    if (icon.left < viewport.left + inset) node.scrollLeft += icon.left - viewport.left - inset;
    else if (icon.right > viewport.right - inset) node.scrollLeft += icon.right - viewport.right + inset;
  }, [selected, collections.length]);

  function move(direction: number) {
    const node = rail.current;
    if (!node) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({ left: direction * Math.max(120, node.clientWidth * 0.8), behavior: reducedMotion ? "instant" : "smooth" });
  }

  return (
    <div ref={wrapper} className="relative mb-1 flex min-w-0 items-center gap-1">
      {edges.overflow && <button type="button" aria-label="Scroll collections left" disabled={!edges.left} onClick={() => move(-1)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"><ChevronLeft className="size-4" /></button>}
      <div ref={rail} className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain scrollbar-none">
        <div ref={items} role="group" aria-label="Save this capture to" className="flex w-max min-w-0 items-center gap-1.5 px-1 py-1.5">
          <DestinationButton label="Inbox" selected={!selected} disabled={disabled} onClick={() => onSelect()}>
            <Inbox className="size-4" aria-hidden />
          </DestinationButton>
          {collections.map((collection) => (
            <DestinationButton key={collection.id} label={isSharedDestination(collection) ? `${collection.name} (shared collection)` : collection.name} selected={collection.id === selected} disabled={disabled} onClick={() => onSelect(collection.id)}>
              <CollectionIcon icon={collection.icon} color={collection.color} size="md" className="size-full rounded-full" />
            </DestinationButton>
          ))}
        </div>
      </div>
      {edges.overflow && <button type="button" aria-label="Scroll collections right" disabled={!edges.right} onClick={() => move(1)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-30"><ChevronRight className="size-4" /></button>}
    </div>
  );
}

function DestinationButton({ label, selected, disabled, onClick, children }: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={selected} disabled={disabled} onClick={onClick} className={cn(
      "grid size-10 shrink-0 place-items-center rounded-full border border-transparent bg-muted text-muted-foreground",
      "transition-[box-shadow,background-color] hover:bg-accent active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
      selected && "border-primary bg-primary-soft text-primary ring-2 ring-primary/25",
    )}>
      {children}
    </button>
  );
}
