"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Bell, CalendarCheck, Check, ChevronLeft, ChevronRight, Link2, Plus, Repeat } from "lucide-react";
import { PageHeader } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Segmented, Skeleton } from "@/components/ui/misc";
import { useStash } from "@/components/shell/stash-context";
import { expandOccurrences, useReminderMutations, useReminders, type Occurrence, type ReminderWithEntry } from "@/lib/data/reminders";
import { summarize } from "@/lib/data/entries";
import { useLocalState } from "@/hooks/use-local-state";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "agenda";
type StatusFilter = "open" | "all" | "done";
type LinkFilter = "all" | "linked" | "standalone";

const WEEK_OPTS = { weekStartsOn: 1 as const };

export default function CalendarPage() {
  return (
    <Suspense>
      <Calendar />
    </Suspense>
  );
}

function Calendar() {
  const params = useSearchParams();
  const [view, setView] = useLocalState<View>("stash-cal-view", "month");
  const [status, setStatus] = useLocalState<StatusFilter>("stash-cal-status", "open");
  const [link, setLink] = useLocalState<LinkFilter>("stash-cal-link", "all");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const { data, isLoading, error, refetch } = useReminders();
  const { openReminder } = useStash();
  const effectiveView = (params.get("view") as View | null) ?? view;

  const reminders = useMemo(() => {
    return (data ?? []).filter((r) => {
      if (status === "open" && r.completed_at) return false;
      if (status === "done" && !r.completed_at) return false;
      if (link === "linked" && !r.entry_id) return false;
      if (link === "standalone" && r.entry_id) return false;
      return true;
    });
  }, [data, status, link]);

  const step = (dir: number) => {
    if (effectiveView === "month") setCursor((c) => addMonths(c, dir));
    else if (effectiveView === "week") setCursor((c) => addWeeks(c, dir));
  };

  const title =
    effectiveView === "month"
      ? format(cursor, "MMMM yyyy")
      : effectiveView === "week"
        ? `${format(startOfWeek(cursor, WEEK_OPTS), "d MMM")} – ${format(endOfWeek(cursor, WEEK_OPTS), "d MMM yyyy")}`
        : "Upcoming";

  const newAt = (day: Date) => {
    const at = new Date(day);
    at.setHours(9, 0, 0, 0);
    openReminder({ due_at: at.toISOString() });
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        actions={
          <Button size="sm" onClick={() => newAt(effectiveView === "agenda" ? new Date() : selected)}>
            <Plus /> Reminder
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={effectiveView}
            onChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
              { value: "agenda", label: "Agenda" },
            ]}
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Status" className="h-8 rounded-lg border bg-card px-2 text-[13px] text-muted-foreground outline-none">
            <option value="open">Open</option>
            <option value="all">All</option>
            <option value="done">Completed</option>
          </select>
          <select value={link} onChange={(e) => setLink(e.target.value as LinkFilter)} aria-label="Type" className="h-8 rounded-lg border bg-card px-2 text-[13px] text-muted-foreground outline-none">
            <option value="all">All reminders</option>
            <option value="linked">Linked to entries</option>
            <option value="standalone">Standalone tasks</option>
          </select>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-5xl px-4 pt-4 md:px-8">
        {effectiveView !== "agenda" && (
          <div className="mb-3 flex items-center gap-2">
            <h2 className="flex-1 text-lg font-semibold tracking-tight">{title}</h2>
            <Button variant="outline" size="sm" onClick={() => { setCursor(new Date()); setSelected(startOfDay(new Date())); }}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label="Next">
              <ChevronRight />
            </Button>
          </div>
        )}

        {isLoading && <Skeleton className="h-96 w-full rounded-2xl" />}
        {error && <ErrorState error={error} onRetry={() => refetch()} />}
        {data && effectiveView === "month" && (
          <MonthView cursor={cursor} reminders={reminders} selected={selected} onSelect={setSelected} onNew={newAt} />
        )}
        {data && effectiveView === "week" && <WeekView cursor={cursor} reminders={reminders} onNew={newAt} />}
        {data && effectiveView === "agenda" && <AgendaView reminders={reminders} showDone={status !== "open"} />}
      </div>
    </>
  );
}

function MonthView({
  cursor,
  reminders,
  selected,
  onSelect,
  onNew,
}: {
  cursor: Date;
  reminders: ReminderWithEntry[];
  selected: Date;
  onSelect: (d: Date) => void;
  onNew: (d: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor), WEEK_OPTS);
  const end = endOfWeek(endOfMonth(cursor), WEEK_OPTS);
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const occurrences = useMemo(() => expandOccurrences(reminders, start, addDays(end, 1)), [reminders, start.getTime(), end.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrences) {
      const k = format(o.at, "yyyy-MM-dd");
      map.set(k, [...(map.get(k) ?? []), o]);
    }
    return map;
  }, [occurrences]);
  const selectedItems = byDay.get(format(selected, "yyyy-MM-dd")) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="py-2">
              {format(addDays(start, i), "EEE")}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const items = byDay.get(format(day, "yyyy-MM-dd")) ?? [];
            const isSel = isSameDay(day, selected);
            return (
              <button
                key={day.toISOString()}
                onClick={() => onSelect(day)}
                onDoubleClick={() => onNew(day)}
                aria-label={`${format(day, "EEEE d MMMM")}, ${items.length} reminders`}
                aria-pressed={isSel}
                className={cn(
                  "flex min-h-14 flex-col items-center gap-1 border-r border-b p-1 text-left transition-colors last:border-r-0 sm:min-h-24 sm:items-stretch sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                  !isSameMonth(day, cursor) && "bg-muted/30 text-muted-foreground/60",
                  isSel ? "bg-primary-soft" : "hover:bg-accent/50",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums sm:self-start",
                    isToday(day) && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                <span className="flex gap-0.5 sm:hidden">
                  {items.slice(0, 3).map((o) => (
                    <span key={o.key} className={cn("size-1.5 rounded-full", o.reminder.completed_at ? "bg-muted-foreground/40" : "bg-primary")} />
                  ))}
                </span>
                <span className="hidden w-full flex-col gap-0.5 sm:flex">
                  {items.slice(0, 3).map((o) => (
                    <span
                      key={o.key}
                      className={cn(
                        "truncate rounded px-1 py-0.5 text-[11px]",
                        o.reminder.completed_at ? "text-muted-foreground line-through" : "bg-primary-soft text-primary",
                      )}
                    >
                      {!o.reminder.all_day && <span className="tabular-nums opacity-70">{format(o.at, "HH:mm")} </span>}
                      {o.reminder.title}
                    </span>
                  ))}
                  {items.length > 3 && <span className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <section aria-label={format(selected, "EEEE d MMMM")}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{isToday(selected) ? "Today" : format(selected, "EEEE, d MMMM")}</h3>
          <button onClick={() => onNew(selected)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
        {selectedItems.length ? (
          <ul className="space-y-1.5">
            {selectedItems.map((o) => (
              <ReminderRow key={o.key} occurrence={o} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nothing scheduled</p>
        )}
      </section>
    </div>
  );
}

function WeekView({ cursor, reminders, onNew }: { cursor: Date; reminders: ReminderWithEntry[]; onNew: (d: Date) => void }) {
  const start = startOfWeek(cursor, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const occurrences = useMemo(() => expandOccurrences(reminders, start, addDays(start, 7)), [reminders, start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-3 md:grid-cols-7 md:gap-2">
      {days.map((day) => {
        const items = occurrences.filter((o) => isSameDay(o.at, day));
        return (
          <section key={day.toISOString()} className={cn("rounded-2xl border bg-card p-2.5 md:min-h-64", isToday(day) && "border-primary/40 ring-2 ring-primary/10")}>
            <div className="mb-2 flex items-center justify-between md:flex-col md:items-start md:gap-0.5">
              <div className="flex items-baseline gap-1.5 md:flex-col md:gap-0">
                <span className="text-[11px] font-medium text-muted-foreground uppercase">{format(day, "EEE")}</span>
                <span className={cn("text-lg font-semibold tabular-nums", isToday(day) && "text-primary")}>{format(day, "d")}</span>
              </div>
              <button onClick={() => onNew(day)} className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent md:hidden" aria-label={`Add reminder on ${format(day, "EEEE")}`}>
                <Plus className="size-4" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {items.map((o) => (
                <ReminderRow key={o.key} occurrence={o} compact />
              ))}
            </ul>
            <button onClick={() => onNew(day)} className="mt-1 hidden w-full rounded-lg py-1 text-xs text-muted-foreground/0 transition hover:bg-accent hover:text-muted-foreground md:block" aria-label={`Add reminder on ${format(day, "EEEE")}`}>
              + Add
            </button>
          </section>
        );
      })}
    </div>
  );
}

function AgendaView({ reminders, showDone }: { reminders: ReminderWithEntry[]; showDone: boolean }) {
  const now = new Date();
  const horizon = addDays(startOfDay(now), 60);
  const overdue = reminders
    .filter((r) => !r.completed_at && new Date(r.due_at) < now)
    .map<Occurrence>((r) => ({ key: r.id, reminder: r, at: new Date(r.due_at), current: true }));
  const upcoming = expandOccurrences(
    reminders.filter((r) => r.completed_at || new Date(r.due_at) >= now),
    showDone ? addDays(now, -60) : now,
    horizon,
  ).filter((o) => o.reminder.completed_at || o.at >= now);

  const groups = new Map<string, Occurrence[]>();
  for (const o of upcoming) {
    const k = format(o.at, "yyyy-MM-dd");
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }

  if (!overdue.length && !upcoming.length) {
    return <EmptyState icon={CalendarCheck} title="All clear" description="No upcoming reminders. Add one from any saved entry, or create a standalone task." />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {overdue.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-destructive uppercase">Overdue · {overdue.length}</h3>
          <ul className="space-y-1.5">
            {overdue.map((o) => (
              <ReminderRow key={o.key} occurrence={o} showDate />
            ))}
          </ul>
        </section>
      )}
      {[...groups.entries()].map(([k, items]) => {
        const d = new Date(`${k}T00:00:00`);
        return (
          <section key={k}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {isToday(d) ? "Today" : isSameDay(d, addDays(now, 1)) ? "Tomorrow" : format(d, "EEEE, d MMMM")}
            </h3>
            <ul className="space-y-1.5">
              {items.map((o) => (
                <ReminderRow key={o.key} occurrence={o} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ReminderRow({ occurrence, compact, showDate }: { occurrence: Occurrence; compact?: boolean; showDate?: boolean }) {
  const user = useUser();
  const { openReminder, openEntry } = useStash();
  const { toggleComplete } = useReminderMutations(user.id);
  const r = occurrence.reminder;
  const done = !!r.completed_at;
  const overdue = !done && occurrence.current && occurrence.at < new Date();
  const entryLabel = r.entry ? r.entry.title || summarize(r.entry.body ?? r.entry.url ?? "Entry", 50) : null;

  return (
    <li className={cn("flex items-start gap-2.5 rounded-xl border bg-card p-2.5 shadow-soft animate-fade-up", compact && "p-2", !occurrence.current && "opacity-60")}>
      <button
        onClick={() => occurrence.current && toggleComplete.mutate(r)}
        disabled={!occurrence.current}
        aria-label={done ? "Mark as not done" : "Mark as done"}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          done ? "border-success bg-success text-white" : overdue ? "border-destructive/60 hover:border-destructive" : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => openReminder({ id: r.id, title: r.title, notes: r.notes, entryId: r.entry_id, due_at: r.due_at, all_day: r.all_day, repeat: r.repeat })}
      >
        <span className={cn("block text-sm leading-snug", compact && "text-[13px]", done && "text-muted-foreground line-through")}>{r.title}</span>
        <span className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {r.repeat !== "none" ? <Repeat className="size-3" /> : <Bell className="size-3" />}
          {r.all_day ? "All day" : format(occurrence.at, "HH:mm")}
          {showDate && ` · ${format(occurrence.at, "EEE d MMM")}`}
        </span>
      </button>
      {r.entry && entryLabel && !compact && (
        <button
          onClick={() => openEntry(r.entry!.id)}
          className="hidden max-w-40 shrink-0 items-center gap-1 truncate rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex"
        >
          <Link2 className="size-3 shrink-0" />
          <span className="truncate">{entryLabel}</span>
        </button>
      )}
      {r.entry && compact && (
        <button onClick={() => openEntry(r.entry!.id)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent" aria-label="Open linked entry">
          <Link2 className="size-3.5" />
        </button>
      )}
    </li>
  );
}
