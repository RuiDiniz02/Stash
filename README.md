# Stash

A private, mobile‑first place to capture anything — notes, links, photos, videos, voice notes and files — organize it later, and find it instantly on every device.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · shadcn/ui‑style components on Radix · Supabase (Postgres, Auth, Storage, Realtime, RLS) · TanStack Query · installable PWA.

**v1.3:** shared bottom capture composer, focused group panels, a working “Add existing” picker, contextual mobile actions, safer drafts/retries and on-demand organization UI. See [implementation and verification notes](docs/ux-refinement.md).

---

## Feature status

### ✅ Fully implemented (works with a Supabase project)

| Area | What works |
| --- | --- |
| **Auth** | Email/password sign‑up, sign‑in, email confirmation, password reset, sign‑out. Sessions refreshed in `src/proxy.ts`; every page and API route is protected. |
| **Quick capture** | Inline “chat with yourself” composer (Enter to save) and a full capture sheet (`N`, the floating **+**, or the centre tab on mobile). Text, links, multiple photos/videos/files per entry, camera capture on phones, voice notes (MediaRecorder), optional title/description/tags/collections/reminder. Saving needs no category. |
| **Paste & drop** | Paste a screenshot, link or text anywhere (outside inputs) → opens capture. Drag files anywhere onto the window. |
| **Inbox timeline** | Chronological feed grouped by day, list or masonry grid, pinned strip, filters (All / Pinned / Favorites / Uncategorized / Archived), infinite scroll, skeletons, empty and error states. |
| **Entries** | Edit title, note, description, link; add/remove attachments; pin, favorite, archive, delete (files removed from Storage too); share via the Web Share API (including files where supported) or copy. Right‑side detail panel on desktop, full‑screen sheet on mobile, deep‑linkable with `?entry=<id>`. |
| **Link previews** | Server‑side Open Graph/oEmbed fetch (`/api/link-preview`) with SSRF protection. YouTube, Vimeo, TikTok, Spotify and Reddit use their public oEmbed endpoints. YouTube/Vimeo play inline (they allow embedding). Other platforms show a card linking to the original. |
| **Groups** (v1.1) | Select several Inbox entries (Select button, long‑press on touch, or the checkbox on hover) and group them into one idea. Groups expand/collapse in the Inbox and can be renamed, ungrouped, or have entries added/removed. Entries are never copied; a group disappears automatically when its last entry leaves it. |
| **Drag to group** (v1.2) | Like folders on an iPhone: hold an entry (≈0.3 s on touch, or drag with the mouse) and drop it on another entry to create a group, or on a group to add it. The new group asks for a name right away; confirming the name saves it as a collection with the same name (or links an existing one). The database keeps that collection in step with the group; ungrouping keeps the collection. |
| **Undo instead of confirmations** (v1.1) | Delete, archive, ungroup, remove from group/collection and reminder deletion apply at once with an Undo toast. Deletes are committed after the 5‑second undo window. |
| **Collections** | Create, rename, change icon/colour, reorder (drag on desktop, or Move up/down), delete. Entries can be in several collections. One‑click “suggested collections”. Capture directly into a collection. |
| **Tags** | Autocomplete tag input, tag browsing in sidebar and search. |
| **Search** | Postgres full‑text + partial matching across titles, notes, descriptions, URLs, link titles, tags, collection names and file names, via the `search_entries` RPC. Filters: type, date range, favorites, archived, collection, tag. |
| **Media library** | Masonry gallery of every photo and video, sort and filter, full‑screen viewer with swipe/arrow keys, video playback, download, “open entry” and “open source link”. |
| **Calendar & reminders** | Month, week and agenda views. Create tasks/reminders standalone or linked to entries, with all‑day and repeats (daily/weekly/monthly/yearly; future repeats are projected in the calendar). Complete, reopen, snooze, edit, delete. Overdue section. Filters: open/completed, linked/standalone. |
| **Notifications** | In‑app toasts plus system notifications (with permission) while Stash is open, including in a background tab. Missed reminders are summarized the next time you open Stash. |
| **Sync** | All data lives in Supabase. Realtime Postgres Changes refresh other open devices within about a second. |
| **Offline** | A service worker caches the app shell and static assets and shows an offline page. Text and link captures made offline are queued and synced automatically. |
| **Settings** | Light/dark/auto theme, accent colour (synced across devices), notification permission, install prompt, storage usage with largest files, JSON export with 7‑day file links, password change, sign‑out, full account deletion. |
| **PWA** | Manifest, generated icons (including maskable), app shortcuts, standalone display, Web Share Target (Android/Chromium). |
| **Accessibility & UX** | Keyboard shortcuts (`N`, `⌘/Ctrl+K`, `/`, `[`, `⌘/Ctrl+Enter`, `Esc`), focus rings, ARIA labels, reduced‑motion support, safe‑area insets, 16px inputs on mobile to prevent zoom. |

### 🟡 Needs an extra integration (architecture is ready)

| Feature | What's missing | Where to plug it in |
| --- | --- | --- |
| **Reminders while the app is closed** | Web Push: VAPID keys, a `push_subscriptions` table, and a scheduled sender (a Supabase Edge Function plus `pg_cron` running every minute). | `public/sw.js` already handles `push` and `notificationclick`. |
| **Instagram / Facebook / X previews** | These platforms put content behind a login wall. Rich previews need Meta's oEmbed API (app review and access token) or a paid unfurling service. | `src/lib/link-preview.ts`: add an endpoint to the `endpoints` map. |
| **Server‑side thumbnails** | Images are downsized in the browser before upload (max 3200px), but no thumbnails are generated. Supabase Image Transformations (Pro plan) or an Edge Function could add them. | `AttachmentImage` in `src/components/entries/media.tsx` |
| **Video poster frames** | Videos show their first frame through `preload="metadata"`. Real poster images would need server‑side processing. | Same as above |
| **Uploads larger than 50 MB** | The Supabase free plan caps files at 50 MB. On paid plans, raise the bucket limit and switch to resumable (TUS) uploads. | `MAX_FILE_BYTES` in `src/lib/env.ts` and the bucket in the migration |
| **Offline file uploads** | Offline captures queue text and links only. Queuing files would need an IndexedDB outbox. | `src/lib/outbox.ts` |

### 🔴 Needs native mobile development

| Feature | Why |
| --- | --- |
| **iOS Share Sheet (“Share to Stash” from Instagram, Safari, Photos…)** | iOS does **not** support the Web Share Target API, so a PWA cannot appear in the iOS share sheet. This requires a native iOS app with a **Share Extension**. |
| **Reliable background notifications on iOS** | Web Push works on iOS 16.4+ only for PWAs added to the Home Screen, and delivery is less reliable than native. Exact‑time local notifications need a native app. |
| **Saving social videos as files** | Stash stores links to Instagram, TikTok and YouTube posts. It does not download the videos, because platform terms and technical protections prevent it. |

On **Android** (Chrome and Edge), installing the PWA adds Stash to the system share sheet. Shared text, URLs and files are received through `/share-target` and open in the capture sheet.

---

## Versions

The version shown in the app (sidebar, end of the Inbox on mobile, Settings, launch screen) comes from `version` in `package.json`. Bump it with each release: 1.0 = first release with launch screen; 1.1 = groups, multi‑select, undo, collection sheet, compact mobile header; 1.2 = drag one entry onto another to group, named groups become collections, logo in the mobile header goes to the Inbox.

## Getting started (local)

Requirements: **Node.js 22+**, a free [Supabase](https://supabase.com) project.

```bash
npm install
```

### 1. Create the database

In your Supabase project, open **SQL Editor** and run each file in `supabase/migrations/` in order (`20261028120000_init.sql`, `20261030120000_entry_groups.sql`, `20261030150000_group_collections.sql`).
Or use the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

The migration creates:

- tables `profiles`, `entries`, `collections`, `entry_collections`, `tags`, `entry_tags`, `attachments`, `reminders`, `entry_groups`
- Row Level Security policies (owner‑only) on every table, with explicit grants to `authenticated` and none to `anon`
- composite foreign keys so a row can never reference another user's data
- the `search_entries` RPC (security invoker) and `delete_my_account` RPC (deletes only the caller)
- a private Storage bucket `stash` (50 MB per file) with per‑user folder policies
- Realtime publication for cross‑device sync

### 2. Configure Auth

**Authentication → URL Configuration**

- **Site URL:** `http://localhost:3000` (your production URL later)
- **Redirect URLs:** add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`

Email confirmation is on by default. You can turn it off under **Authentication → Providers → Email** for faster local testing.

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **Project Settings → API Keys**. A legacy `anon` key also works. **No service‑role or secret key is used anywhere.** All access goes through the user's session and RLS.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, create an account, and start capturing. If the env vars are missing, the app shows a `/setup` page instead.

Other scripts:

```bash
npm run typecheck
```

```bash
npm run build
```

---

## Deployment

**Vercel (recommended)**

1. Push the repo to GitHub and import it in Vercel.
2. Set the env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` (your production URL).
3. Deploy, then add `https://<your-domain>/auth/callback` to Supabase redirect URLs and set the Site URL.

Any Node 22+ host works (`npm run build && npm start`). The app needs HTTPS in production for the service worker, the microphone, notifications and the share target.

---

## PWA notes

- The manifest is `src/app/manifest.ts`. Icons are generated at build time (`src/app/icons/[size]/route.tsx`, `icon.tsx`, `apple-icon.tsx`).
- The service worker is `public/sw.js`. It registers in production builds only, so it doesn't interfere with hot reload. Bump `VERSION` when you change caching rules.
- **Install:** Chrome, Edge and Android show an Install button in Settings. On iOS, use Safari → Share → *Add to Home Screen*.
- **Share target:** the service worker intercepts the `POST /share-target`, stores shared files in IndexedDB and opens `/share`, which fills in the capture sheet. If the service worker isn't active yet, a server fallback keeps the shared text and URL.

---

## Architecture

```
src/
  app/
    (auth)/            login, signup, forgot/reset password
    (app)/             signed-in app: inbox (/), collections, calendar, search, media, settings, share
    api/link-preview/  server-side metadata fetch (auth required, SSRF-guarded)
    auth/callback/     email confirmation / recovery (PKCE code or token_hash)
    share-target/      Web Share Target fallback
    manifest.ts, icon.tsx, icons/[size]
  components/
    shell/             app shell, sidebar, bottom nav, realtime/outbox sync, global shortcuts/paste/drop
    capture/           capture sheet, quick composer, voice recorder
    entries/           cards, feed, detail panel, link cards, media renderers, actions menu
    collections/ reminders/ media/ pickers/ settings/ ui/
  lib/
    data/              TanStack Query hooks + Supabase calls (entries, collections, tags, reminders, search, media, account)
    supabase/          browser, server and proxy clients (@supabase/ssr)
    link-preview.ts    OG/oEmbed parser with private-IP blocking and redirect re-validation
    outbox.ts          offline capture queue
  proxy.ts             session refresh + route protection (Next.js 16 "proxy", formerly middleware)
public/sw.js           service worker
supabase/migrations/   schema, RLS, storage, RPCs
```

**Data flow.** Pages are client components that read and write Supabase directly with the user's JWT. RLS enforces ownership, and composite FKs enforce relationships between a user's own rows. Server code is used only where it adds security or capability: session refresh, auth callbacks, and link previews, which can't run in the browser because of CORS and SSRF.

**Files** go in `stash/<user_id>/<entry_id>/<random>-<name>`. Storage policies only allow a user into their own top‑level folder, and a DB check constraint ties each `attachments.storage_path` to its owner. Files are shown with short‑lived signed URLs, batched into a single request per render.

**Ready for native apps.** A future iOS or Android app (for example Swift with `supabase-swift`, or React Native with `supabase-js`) can use the same tables, RPCs, Storage paths and RLS unchanged. An iOS Share Extension would:

1. receive the shared URL, text or media
2. upload files to `stash/<uid>/<new-entry-id>/…` with the session stored in a shared App Group keychain
3. insert the `entries` and `attachments` rows

No backend changes are needed.

---

## Security checklist

- RLS enabled on every table; policies use `TO authenticated` with `(select auth.uid()) = user_id`, and UPDATE policies have both `USING` and `WITH CHECK`.
- `anon` has no table privileges; RPCs are revoked from `public`/`anon`.
- `delete_my_account` is the only `SECURITY DEFINER` function in `public`. It takes no arguments and deletes only `auth.uid()`.
- No secret keys in the codebase. The link‑preview endpoint requires a session and blocks private, loopback and link‑local addresses, re‑checking after every redirect.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, a strict referrer policy and a permissions policy.

## Verification done

- `npm run typecheck` and `npm run build` pass (Next.js 16.4.3).
- The migration was run against Postgres 17 (PGlite) with stand‑ins for Supabase's `auth` and `storage` schemas. 32 checks passed:
  - cross‑user reads, updates, inserts and ownership changes are blocked
  - links to another user's collection are rejected by the composite FKs
  - Storage folder isolation holds
  - search matches by body, partial word, tag, collection, file name and URL, with filters and wildcard escaping
  - cascades work, and deleting an entry keeps its reminder
  - `delete_my_account` removes only the caller and can't be called by `anon`
- Public pages (sign‑in, sign‑up, setup, offline), icons and the manifest were checked in a browser in light and dark mode and at phone width.
- Against a live Supabase project, signed in as a test user:
  - a note, a YouTube link (full oEmbed preview) and an Instagram link (fallback card) were saved
  - a tag, a new collection and a Saturday 10:00 reminder were added from the detail panel and confirmed in the database
  - a photo was uploaded through drag & drop to private Storage and displayed with a signed URL
  - search found entries by note text and by file name
  - the Calendar, Media, Collections and Settings pages load
  - a row inserted from "another device" appeared in the open Inbox in under a second
- **Not verified:** system notifications (the test browser blocks them), the microphone, the Android share target and installing the PWA. These need a real device.

### Suggested manual test (the four scenarios)

1. Copy an Instagram Reel URL → open Stash → paste anywhere → **Save**. Then search for a word from it, and add it to a collection from the **⋯** menu.
2. Tap **+** → tap the mic → record → **Save**.
3. Save a reference → **⋯ → Remind me…** → choose **Saturday 10:00**. Check **Calendar → Week**.
4. Upload a photo on your phone, then open Stash on a desktop. It appears there within about a second, or on the next refresh.
