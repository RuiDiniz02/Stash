export type EntryKind = "note" | "link" | "image" | "video" | "audio" | "file" | "mixed";
export type AttachmentKind = "image" | "video" | "audio" | "file";
export type RepeatInterval = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const ACCENTS = ["indigo", "blue", "teal", "green", "amber", "orange", "rose", "violet", "graphite"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface LinkPreview {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
  favicon?: string | null;
  author?: string | null;
  provider?: Provider | null;
  /** Provider-specific id that can be embedded (only YouTube/Vimeo, which allow it). */
  embed_id?: string | null;
  fetched_at?: string;
  failed?: boolean;
}

export type Provider =
  | "youtube"
  | "vimeo"
  | "tiktok"
  | "instagram"
  | "x"
  | "facebook"
  | "pinterest"
  | "threads"
  | "reddit"
  | "spotify"
  | "web";

export interface Attachment {
  id: string;
  entry_id: string;
  user_id: string;
  storage_path: string;
  kind: AttachmentKind;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  position: number;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  entry_count?: number;
}

export interface Reminder {
  id: string;
  user_id: string;
  entry_id: string | null;
  title: string;
  notes: string | null;
  due_at: string;
  all_day: boolean;
  repeat: RepeatInterval;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryRow {
  id: string;
  user_id: string;
  kind: EntryKind;
  title: string | null;
  body: string | null;
  description: string | null;
  url: string | null;
  link_preview: LinkPreview | null;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  group_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Entry with its relations, as returned by ENTRY_SELECT. */
export interface Entry extends EntryRow {
  attachments: Attachment[];
  collection_ids: string[];
  tags: Tag[];
  reminders: Reminder[];
  /** Client-only: queued offline, not yet synced. */
  pending?: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  accent: Accent;
}

export interface EntryGroup {
  id: string;
  title: string;
  created_at: string;
  entry_count: number;
}
