import { useSyncExternalStore } from "react";
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";

// The app persists its settings to AsyncStorage under this key (0.9.2
// packages/app/src/hooks/use-settings/keys.ts). The plugin runtime has its own
// QueryClient, so read the stored blob directly. Read-only: never write here.
const APP_SETTINGS_KEY = "@paseo:app-settings";

type MultiGet = (keys: string[], cb: (errors?: unknown, result?: string[][]) => void) => void;

// Same lookup order as @react-native-async-storage/async-storage 2.2 RCTAsyncStorage.ts.
function nativeStorage(): { multiGet: MultiGet } | null {
  const names = ["PlatformLocalStorage", "RNC_AsyncSQLiteDBStorage", "RNCAsyncStorage"];
  for (const name of names) {
    const mod = (TurboModuleRegistry.get(name) ?? NativeModules[name]) as {
      multiGet?: MultiGet;
    } | null;
    if (mod?.multiGet) return mod as { multiGet: MultiGet };
  }
  return null;
}

/** Read one AsyncStorage key the app wrote. Read-only. */
export function readRaw(key = APP_SETTINGS_KEY): Promise<string | null> {
  if (Platform.OS === "web") {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } })
      .localStorage;
    return Promise.resolve(storage?.getItem(key) ?? null);
  }
  const storage = nativeStorage();
  if (!storage) return Promise.reject(new Error("AsyncStorage native module not found"));
  return new Promise((resolve, reject) =>
    storage.multiGet([key], (errors, result) => {
      if (errors) {
        reject(new Error(String(errors)));
        return;
      }
      resolve(result?.[0]?.[1] ?? null);
    }),
  );
}

// Appearance defaults, bounds, and sanitizers copied from 0.9.2
// packages/app/src/hooks/use-settings/storage.ts. The app clamps on read too; the
// plugin reads the same blob directly, so it must validate the same way or the
// Markdown typography drifts from the rest of the app.
const APP_IS_NATIVE = Platform.OS !== "web";
export const DEFAULT_UI_BASE_FONT_SIZE = APP_IS_NATIVE ? 15 : 14; // FONT_SIZE.base
export const DEFAULT_CONTENT_FONT_SIZE = APP_IS_NATIVE ? 16 : 15; // FONT_SIZE.content
export const DEFAULT_CODE_FONT_SIZE = 12; // == FONT_SIZE.code
const MIN_UI_BASE_FONT_SIZE = 10;
const MAX_UI_BASE_FONT_SIZE = 21;
const MIN_CONTENT_FONT_SIZE = 10;
const MAX_CONTENT_FONT_SIZE = 21;
const MIN_CODE_FONT_SIZE = 9;
const MAX_CODE_FONT_SIZE = 22;
const MAX_FONT_FAMILY_LENGTH = 200;

function parseClampedFontSize(value: unknown, bounds: { min: number; max: number }): number | null {
  let numericValue = NaN;
  if (typeof value === "number") {
    numericValue = value;
  } else if (typeof value === "string" && value.trim().length > 0) {
    numericValue = Number(value);
  }
  if (!Number.isFinite(numericValue)) return null;
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(numericValue)));
}

function sanitizeFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.length > MAX_FONT_FAMILY_LENGTH) return "";
  if (/[;{}<>]/.test(trimmed)) return ""; // would break a web CSS font-family declaration
  if ([...trimmed].some((char) => char.charCodeAt(0) <= 0x1f)) return "";
  return trimmed;
}

function parseBlob(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      return decoded as Record<string, unknown>;
    }
  } catch {
    // Corrupt JSON reads as a missing blob; the app removes it on its own read.
  }
  return null;
}

export interface StoredAppSettings {
  /** Code block colours (@getpaseo/highlight syntax theme id). */
  syntaxTheme: string | null;
  /** App styling theme: light, dark, auto, zinc, midnight, claude, ghostty, or a plugin theme. */
  theme: string | null;
  /** "" = platform default UI stack. */
  uiFontFamily: string;
  /** "" = platform default mono stack. */
  monoFontFamily: string;
  /** Clamped px; platform default 15 native / 14 web. */
  uiBaseFontSize: number;
  /** Clamped px; platform default 16 native / 15 web, falling back to the UI base. */
  contentFontSize: number;
  /** Clamped px; default 12. */
  codeFontSize: number;
}

export function parseStoredAppSettings(raw: string | null): StoredAppSettings {
  const blob = parseBlob(raw);
  if (!blob) {
    // No usable blob: the app renders DEFAULT_CLIENT_SETTINGS, whose content size
    // is the platform default (not the UI-base inheritance below).
    return {
      syntaxTheme: null,
      theme: null,
      uiFontFamily: "",
      monoFontFamily: "",
      uiBaseFontSize: DEFAULT_UI_BASE_FONT_SIZE,
      contentFontSize: DEFAULT_CONTENT_FONT_SIZE,
      codeFontSize: DEFAULT_CODE_FONT_SIZE,
    };
  }
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  const uiBase = parseClampedFontSize(blob.uiBaseFontSize, {
    min: MIN_UI_BASE_FONT_SIZE,
    max: MAX_UI_BASE_FONT_SIZE,
  });
  // COMPAT(uiFontSizeScale): pre-v0.4 blobs store a scale; convert like storage.ts.
  const uiScale = parseClampedFontSize(blob.uiFontSize, { min: 11, max: 24 });
  const uiBaseFontSize =
    uiBase ?? (uiScale === null ? DEFAULT_UI_BASE_FONT_SIZE : Math.round((14 * uiScale) / 16));
  const content = parseClampedFontSize(blob.contentFontSize, {
    min: MIN_CONTENT_FONT_SIZE,
    max: MAX_CONTENT_FONT_SIZE,
  });
  return {
    syntaxTheme: str(blob.syntaxTheme),
    theme: str(blob.theme),
    uiFontFamily: sanitizeFontFamily(blob.uiFontFamily),
    monoFontFamily: sanitizeFontFamily(blob.monoFontFamily),
    uiBaseFontSize,
    // Present-but-invalid content size falls back to the default, a missing one
    // to the UI base — the merge behaviour in storage.ts.
    contentFontSize:
      content ?? (blob.contentFontSize === undefined ? uiBaseFontSize : DEFAULT_CONTENT_FONT_SIZE),
    codeFontSize:
      parseClampedFontSize(blob.codeFontSize, {
        min: MIN_CODE_FONT_SIZE,
        max: MAX_CODE_FONT_SIZE,
      }) ?? DEFAULT_CODE_FONT_SIZE,
  };
}

export async function readAppSettings(): Promise<StoredAppSettings> {
  return parseStoredAppSettings(await readRaw());
}

export const DEFAULT_STORED_APP_SETTINGS: StoredAppSettings = parseStoredAppSettings(null);

// ponytail: copied from 0.9.2 packages/app/src/styles/theme.ts (accentBright, the Markdown
// link colour, is the one Markdown colour PluginTheme lacks). Re-copy if Paseo changes it.
const LINK_COLORS: Record<string, string> = {
  light: "#239956",
  dark: "#7ccba0",
  zinc: "#fafafa",
  midnight: "#7eaaeb",
  claude: "#e89a7f",
  ghostty: "#b4d0fc",
};

export function linkColorFor(
  theme: string | null,
  scheme: "light" | "dark",
  fallback: string,
): string {
  const name = !theme || theme === "auto" ? scheme : theme;
  return LINK_COLORS[name] ?? fallback;
}

// Loaded once per plugin start (index.client.tsx); components subscribe so they
// re-render when the stored values arrive. A changed setting shows after reload.
let current: StoredAppSettings = DEFAULT_STORED_APP_SETTINGS;
const listeners = new Set<() => void>();

export function loadStoredSettings(): void {
  readAppSettings().then(
    (settings) => {
      current = settings;
      for (const listener of listeners) listener();
      return;
    },
    () => {},
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => current;

export function useStoredSettings(): StoredAppSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
