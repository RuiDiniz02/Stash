"use client";

import { addDays, format, nextMonday, nextSaturday, set } from "date-fns";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { REPEAT_LABELS } from "@/lib/data/reminders";
import type { RepeatInterval } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ReminderDraft {
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  allDay: boolean;
  repeat: RepeatInterval;
}

export function draftFromDate(d: Date, allDay = false, repeat: RepeatInterval = "none"): ReminderDraft {
  return { date: format(d, "yyyy-MM-dd"), time: format(d, "HH:mm"), allDay, repeat };
}

/** All-day reminders are stored at 09:00 local time so they still notify in the morning. */
export function draftToIso(d: ReminderDraft) {
  const [y, m, day] = d.date.split("-").map(Number);
  const [h, min] = (d.allDay ? "09:00" : d.time || "09:00").split(":").map(Number);
  return new Date(y, m - 1, day, h, min, 0, 0).toISOString();
}

export function defaultDraft(): ReminderDraft {
  return draftFromDate(set(addDays(new Date(), 1), { hours: 9, minutes: 0, seconds: 0 }));
}

function presets() {
  const now = new Date();
  const at = (d: Date, h: number) => set(d, { hours: h, minutes: 0, seconds: 0, milliseconds: 0 });
  const list = [
    { label: "This evening", date: at(now, 18), hint: "18:00" },
    { label: "Tomorrow", date: at(addDays(now, 1), 9), hint: format(addDays(now, 1), "EEE") + " 09:00" },
    { label: "Saturday", date: at(nextSaturday(now), 10), hint: format(nextSaturday(now), "d MMM") + " 10:00" },
    { label: "Next week", date: at(nextMonday(now), 9), hint: "Mon 09:00" },
  ];
  return list.filter((p) => p.date > now);
}

export function ReminderFields({ value, onChange }: { value: ReminderDraft; onChange: (v: ReminderDraft) => void }) {
  const currentIso = draftToIso(value);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets().map((p) => {
          const active = !value.allDay && p.date.toISOString() === currentIso;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(draftFromDate(p.date, false, value.repeat))}
              className={cn(
                "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                active ? "border-primary/40 bg-primary-soft" : "bg-card hover:bg-accent",
              )}
            >
              <span className="text-[13px] font-medium">{p.label}</span>
              <span className="text-[11px] text-muted-foreground">{p.hint}</span>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="rem-date">Date</Label>
          <Input id="rem-date" type="date" value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rem-time">Time</Label>
          <Input
            id="rem-time"
            type="time"
            value={value.time}
            disabled={value.allDay}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.allDay} onCheckedChange={(v) => onChange({ ...value, allDay: v })} label="All day" />
          All day
        </label>
        <select
          aria-label="Repeat"
          value={value.repeat}
          onChange={(e) => onChange({ ...value, repeat: e.target.value as RepeatInterval })}
          className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-primary/15"
        >
          {Object.entries(REPEAT_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
