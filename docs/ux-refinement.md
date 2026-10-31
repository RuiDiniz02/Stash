# Stash 1.3 — capture and organization refinement

Base: GitHub `main` at `f34eada` (v1.2). This changes the existing application; no database migration is required.

## Audit findings and changes

- Group thumbnails formed an unbounded horizontal row. They now wrap inside a width-constrained card; long text and media also respect their container.
- Expanded groups previously displayed only entries already fetched by the Inbox. Groups now open a focused panel with their own paginated query, scrolling content, and a persistent capture footer.
- “Add entries” depended on the current Inbox selection and filter. It now opens a picker with search over loaded entries, pagination, explicit selection and error states.
- The Inbox and collection pages had capture controls above their content as well as prominent duplicate creation buttons. They now use the same docked composer; the duplicate buttons are absent on these routes.
- The shared composer saves text, URLs and attachments directly, supports paste, preserves account/destination-specific text drafts and retains failed submissions. An in-flight guard prevents repeated taps. A stable entry ID makes retries idempotent for the entry row.
- Group capture uses the existing `group_id` relation. The existing database trigger already assigns group members to the linked collection; client collection assignment now tolerates that association already existing.
- Contextual actions open from touch hold, right-click or the accessible actions button. On narrow screens the menu is presented at the bottom. Desktop mouse dragging remains; touch organization uses the contextual selection/group actions to avoid competing with scrolling and touch hold.
- Selection is available inside group panels and collection pages. The group toolbar replaces its composer while selecting.
- Whole-group selection and collection actions fetch every group member, rather than silently acting on only the current Inbox page. Group panels open on demand and do not reopen automatically after navigation or a page reload.
- Undoing a bulk collection addition only removes the memberships introduced by that action, preserving memberships that already existed.
- Offline saves now report storage failures. Pending text/link captures are visible in their group or collection as well as the Inbox, and the outbox deduplicates capture IDs.
- Organization pickers and the image viewer load on demand. Pinned-entry requests run only when the pinned strip is shown. Existing authentication, private Storage, Realtime, link previews, calendar and RLS remain in place.
- A visual-viewport listener adapts the composer and dialogs to the virtual keyboard; resize observation reserves enough scrolling space for the composer.

## Verification

- Automated outbox coverage: account isolation/destination retention, failed synchronization and retry, concurrent flush deduplication, storage quota failure, and repeated enqueue of the same capture ID.
- Browser checks with an authenticated session at 320 px, 390 px and desktop width: group open/close, long note and long URL wrapping, bottom composer visibility, contextual menu sizing, group selection toolbar, collection navigation, draft restoration after reload, capture into a group, capture into a collection, and adding an existing entry to a group.
- The saved test entries and group/collection memberships were verified in Supabase. The three synthetic test entries were removed afterward; existing notes were preserved.
- TypeScript and production build are checked before handoff. There is no lint script in this repository.
- Both light and dark appearance were inspected. Real touch hold, native keyboard resizing, microphone permissions, file capture and installation still need physical-device checks. Browser viewport emulation does not validate these device behaviors.

## Remaining scope

- The existing named-group-to-collection relationship is preserved. Changing that model should be a separate product decision and migration.
- The picker searches the loaded pages and explicitly offers “Load more”; it does not pretend to search unloaded history.
- Text/link captures work offline; file uploads still require a connection. Full offline browsing remains limited by the existing shell/query cache.
- Explicit date parsing/reminder suggestions are deferred; existing manual reminder creation and the calendar are preserved. No AI, graph or automation features were added.
- Initial-load improvements reduce unnecessary code and requests, but no production mobile performance score or speedup percentage is claimed.
- Production deployment and GitHub publication are separate from this local implementation.
