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

function readRaw(): Promise<string | null> {
  if (Platform.OS === "web") {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } })
      .localStorage;
    return Promise.resolve(storage?.getItem(APP_SETTINGS_KEY) ?? null);
  }
  const storage = nativeStorage();
  if (!storage) return Promise.reject(new Error("AsyncStorage native module not found"));
  return new Promise((resolve, reject) =>
    storage.multiGet([APP_SETTINGS_KEY], (errors, result) => {
      if (errors) {
        reject(new Error(String(errors)));
        return;
      }
      resolve(result?.[0]?.[1] ?? null);
    }),
  );
}

export interface StoredAppSettings {
  /** Code block colours (@getpaseo/highlight syntax theme id). */
  syntaxTheme: string | null;
  /** App styling theme: light, dark, auto, zinc, midnight, claude, ghostty, or a plugin theme. */
  theme: string | null;
}

export async function readAppSettings(): Promise<StoredAppSettings> {
  const raw = await readRaw();
  const blob = raw ? (JSON.parse(raw) as { syntaxTheme?: unknown; theme?: unknown }) : {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return { syntaxTheme: str(blob.syntaxTheme), theme: str(blob.theme) };
}

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
let current: StoredAppSettings = { syntaxTheme: null, theme: null };
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
