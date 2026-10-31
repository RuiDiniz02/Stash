"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { FileText, Link2, Mic, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { suggestGroupTitle, useGroupCommands } from "@/lib/data/groups";
import { useUser } from "@/lib/user-context";
import type { Entry, EntryGroup } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { AttachmentImage } from "./media";
import { useSelection } from "./selection";

type DropData = { type: "entry"; entry: Entry } | { type: "group"; group: EntryGroup };

interface InboxDndState {
  activeId: string | null;
  /** Group just created by a drop; its card opens the name field once. */
  namingGroupId: string | null;
  doneNaming: () => void;
  /** True right after a drag, so the click that ends it doesn't open the entry. */
  justDragged: () => boolean;
}

const InboxDndContext = createContext<InboxDndState | null>(null);

export function useInboxDnd() {
  return useContext(InboxDndContext);
}

/**
 * iPhone-folder style organizing: hold an entry (or drag it with the mouse) and drop it on
 * another entry to make a group, or on a group to add it. Selected entries move together.
 * Holding and releasing in place starts multi-select.
 */
export function InboxDnd({ entries, groups, children }: { entries: Entry[]; groups: EntryGroup[]; children: React.ReactNode }) {
  const user = useUser();
  const commands = useGroupCommands(user.id);
  const selection = useSelection();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [namingGroupId, setNamingGroupId] = useState<string | null>(null);
  const lastDragEnd = useRef(0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const moving = useCallback(
    (id: string) => {
      if (selection?.active && selection.isSelected(id)) return entries.filter((e) => selection.isSelected(e.id));
      const e = byId.get(id);
      return e ? [e] : [];
    },
    [byId, entries, selection],
  );

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    navigator.vibrate?.(12);
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const id = String(event.active.id);
    setActiveId(null);
    lastDragEnd.current = Date.now();
    const items = moving(id);
    const over = event.over?.data.current as DropData | undefined;
    const isTouch = !!event.activatorEvent && "touches" in event.activatorEvent;
    const travelled = Math.hypot(event.delta.x, event.delta.y);

    try {
      if (!over) {
        // Held and released without moving: start selecting, like a long-press.
        if (isTouch && travelled < 12 && selection) {
          if (selection.active) selection.toggle(id);
          else selection.start(id);
        }
        return;
      }

      if (over.type === "group") {
        const toMove = items.filter((e) => e.group_id !== over.group.id);
        if (toMove.length) await commands.add(over.group, toMove);
      } else {
        const target = over.entry;
        if (items.some((e) => e.id === target.id)) return;
        const targetGroup = target.group_id ? groups.find((g) => g.id === target.group_id) : undefined;
        if (targetGroup) {
          const toMove = items.filter((e) => e.group_id !== targetGroup.id);
          if (toMove.length) await commands.add(targetGroup, toMove);
        } else {
          const members = [target, ...items];
          const groupId = await commands.createFromDrop(suggestGroupTitle(members), members);
          setNamingGroupId(groupId);
        }
      }
      if (selection?.active) selection.clear();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const value = useMemo<InboxDndState>(
    () => ({
      activeId,
      namingGroupId,
      doneNaming: () => setNamingGroupId(null),
      justDragged: () => Date.now() - lastDragEnd.current < 250,
    }),
    [activeId, namingGroupId],
  );

  const active = activeId ? byId.get(activeId) : undefined;
  const count = activeId ? moving(activeId).length : 0;

  return (
    <InboxDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={(e) => void onDragEnd(e)}
        onDragCancel={() => setActiveId(null)}
      >
        {children}
        <DragOverlay dropAnimation={null}>{active && <DragPreview entry={active} count={count} />}</DragOverlay>
      </DndContext>
    </InboxDndContext.Provider>
  );
}

/** Draggable + drop target for an entry card. No-op outside the Inbox drag context. */
export function useEntryDnd(entry: Entry, disabled = false) {
  const ctx = useInboxDnd();
  const off = !ctx || disabled || !!entry.pending;
  const drag = useDraggable({ id: entry.id, disabled: off });
  const drop = useDroppable({ id: `entry:${entry.id}`, data: { type: "entry", entry } satisfies DropData, disabled: off });
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      drag.setNodeRef(node);
      drop.setNodeRef(node);
    },
    // setNodeRef functions are stable for a given id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drag.setNodeRef, drop.setNodeRef],
  );
  return {
    enabled: !off,
    setNodeRef,
    dragProps: off ? {} : { ...drag.attributes, ...drag.listeners },
    isDragging: drag.isDragging,
    isOver: drop.isOver && !drag.isDragging && !!ctx?.activeId,
  };
}

export function useGroupDrop(group: EntryGroup) {
  const ctx = useInboxDnd();
  const drop = useDroppable({ id: `group:${group.id}`, data: { type: "group", group } satisfies DropData, disabled: !ctx });
  return { setNodeRef: drop.setNodeRef, isOver: drop.isOver && !!ctx?.activeId };
}

function DragPreview({ entry, count }: { entry: Entry; count: number }) {
  const image = entry.attachments.find((a) => a.kind === "image");
  const text = entry.title || entry.link_preview?.title || entry.body?.split("\n")[0] || entry.attachments[0]?.file_name || entry.url || "Entry";
  const Icon = entry.url ? Link2 : entry.kind === "audio" ? Mic : entry.kind === "file" ? FileText : StickyNote;
  return (
    <div className="relative flex w-60 -rotate-2 items-center gap-2.5 rounded-2xl border bg-card p-2.5 shadow-float">
      <span className="relative size-11 shrink-0 overflow-hidden rounded-xl bg-muted">
        {image ? (
          <AttachmentImage att={image} className="size-full" />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <Icon className="size-4" />
          </span>
        )}
      </span>
      <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium">{text}</span>
      {count > 1 && (
        <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow">
          {count}
        </span>
      )}
    </div>
  );
}
