# GROUPING-PREFERENCE-WORKLOG

Fix: `tool-results-spike` must honor the app user setting `toolCallDetailLevel`
instead of forcing its own overview grouping. Owner currently has `detailed`
(one-by-one); the plugin wrongly forced overview grouping.

## Contract (for parent wiring of client/tool-row.tsx)

```ts
// client/grouping-preference.ts
useToolCallGroupingPreference(): boolean
// true  => preference calls for OVERVIEW (group component may mount + subscribe)
// false => one-by-one (default; detailed). Group component must not mount.
```

## Facts inspected (2026-10-03, packages/app/src/hooks/use-settings/)

- Enum is `ToolCallDetailLevel = "overview" | "detailed"` — NOT "grouped".
  `detailed` = one-by-one, `overview` = grouped.
- Storage key: `@paseo:app-settings` (`keys.ts` APP_SETTINGS_KEY). Legacy key
  `@paseo:settings` (LEGACY_SETTINGS_KEY) is the fallback the app reads when
  the current key is absent. Value is a plain JSON object (no wrapper), fields
  at top level.
- Legacy migration (`storage.ts` ~285):
  `toolCallDetailLevel ?? (compactToolCalls ? "overview" : "detailed")`.
  App zod also maps legacy literal `"concise"` → `"overview"`; an INVALID
  present value catches to `"detailed"` and does NOT consult legacy. Mirrored
  exactly in shared/grouping-preference.ts.
- Plugin SDK (`packages/plugin/src/settings.ts`) exposes only plugin-owned
  host-scoped settings (`settings.<id>.read/write/reset`). It does NOT expose
  app settings. => bounded web-storage adapter is the sanctioned path.

## Plan

1. shared/grouping-preference.ts (pure): resolve raw blob →
   `"overview" | "detailed"`, safe default `"detailed"` (one-by-one).
   TDD: shared/grouping-preference.test.ts (absent/malformed/migration).
2. client/grouping-preference.ts: `useToolCallGroupingPreference()` via
   `useSyncExternalStore`; desktop capability guard before any DOM/storage
   (no window/localStorage => false, never throws); reads at most the two
   documented keys; subscribes to `storage` + `focus` + `visibilitychange`
   (no polling, no monkeypatching, no deps, no core hooks). Same-tab writes
   are picked up on focus/visibility/render refresh (useSyncExternalStore
   re-reads snapshots on render).

## State

- [x] Exploration: keys, enum, migration, SDK surface, plugin tsconfig/tests
- [x] Journal (this file)
- [x] shared/grouping-preference.test.ts (red first, then 11/11 green)
- [x] shared/grouping-preference.ts (green)
- [x] client/grouping-preference.ts (structural casts — plugin tsconfig has no DOM lib; tsconfig untouched)
- [x] plugin typecheck + scoped lint + format: all clean. No install/reload/commit/push.

Note: enum correction vs brief guess — level is `detailed | overview`, not
`grouped`. Legacy literal `concise` → overview; invalid present value →
detailed (legacy NOT consulted), absent value → compactToolCalls migration.

## Limitations (logged, not hidden)

- Web/desktop only; mobile is parked (guard returns one-by-one everywhere
  without DOM/storage).
- DOM `storage` events do not fire for same-document writes; a same-tab
  settings change is observed on the next focus, visibility, or render
  refresh — no polling interval exists.
- The adapter reads two localStorage keys; it never writes, deletes, or
  scans storage.
- No file outside the four owned by this task was touched; parent owns the
  `tool-row.tsx` wiring that consumes the hook.
