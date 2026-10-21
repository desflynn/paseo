import { useSyncExternalStore } from "react";
import { prefersToolCallGrouping } from "../shared/grouping-preference";

/**
 * Desktop adapter over the app user setting `toolCallDetailLevel`
 * (`@paseo:app-settings`; legacy fallback `@paseo:settings`). The public
 * plugin SDK exposes only plugin-owned settings, never app settings, so this
 * reads the two documented localStorage keys directly — read-only, at most
 * those two keys, never writes or scans.
 *
 * Reacts to changes via `storage` + `focus` + `visibilitychange` events.
 * DOM `storage` events do not fire for same-document writes, so a same-tab
 * settings change is observed on the next focus, visibility, or render
 * refresh (useSyncExternalStore re-reads getSnapshot on render). There is no
 * polling interval and no monkeypatching of app internals.
 *
 * Capability guard: without a window carrying localStorage (native, SSR,
 * tests) this never touches storage and reports one-by-one (false), the safe
 * default. Mobile support is parked. DOM surfaces are reached through
 * structural casts because the plugin tsconfig has no DOM lib.
 */

const APP_SETTINGS_KEY = "@paseo:app-settings";
const LEGACY_SETTINGS_KEY = "@paseo:settings";
const SETTINGS_KEYS = new Set([APP_SETTINGS_KEY, LEGACY_SETTINGS_KEY]);

interface MinimalWindow {
  localStorage?: { getItem(key: string): string | null };
  addEventListener(type: string, listener: (event: { key: string | null }) => void): void;
}

interface MinimalDocument {
  addEventListener(type: string, listener: () => void): void;
}

function webWindow(): MinimalWindow | undefined {
  const w = (globalThis as { window?: MinimalWindow }).window;
  return w && typeof w.localStorage !== "undefined" ? w : undefined;
}

function readGroupingFromStorage(): boolean {
  const w = webWindow();
  if (!w || !w.localStorage) return false;
  try {
    for (const key of [APP_SETTINGS_KEY, LEGACY_SETTINGS_KEY]) {
      const raw = w.localStorage.getItem(key);
      if (raw === null) continue;
      try {
        return prefersToolCallGrouping(JSON.parse(raw));
      } catch {
        // Corrupt current key: the app deletes and re-reads; here we just fall
        // through to the legacy key, then to the safe default.
        continue;
      }
    }
  } catch {
    // localStorage itself denied (privacy mode, sandbox): safe default.
  }
  return false;
}

let cached: boolean | undefined;
const listeners = new Set<() => void>();
let windowListenersAttached = false;

function invalidate() {
  cached = undefined;
  for (const listener of listeners) listener();
}

function attachWindowListeners() {
  if (windowListenersAttached) return;
  const w = webWindow();
  if (!w) return;
  windowListenersAttached = true;
  w.addEventListener("storage", (event) => {
    // event.key === null means storage.clear(); otherwise only settings keys matter.
    if (event.key === null || SETTINGS_KEYS.has(event.key)) invalidate();
  });
  w.addEventListener("focus", invalidate);
  (globalThis as { document?: MinimalDocument }).document?.addEventListener(
    "visibilitychange",
    invalidate,
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  attachWindowListeners();
  return () => {
    listeners.delete(listener);
    // Window listeners are intentionally left attached once created; they are
    // invalidation-only, and re-attaching per subscriber would churn handlers
    // as rows mount and unmount.
  };
}

function getSnapshot(): boolean {
  if (cached === undefined) cached = readGroupingFromStorage();
  return cached;
}

/**
 * True only when the app user preference calls for OVERVIEW grouping; false
 * keeps one-by-one rows (the safe default). The group component must mount
 * and subscribe only while this is true.
 */
export function useToolCallGroupingPreference(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
