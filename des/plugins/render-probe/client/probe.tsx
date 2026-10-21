import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Text, View } from "react-native";
import { linkColorFor, readAppSettings, type StoredAppSettings } from "./app-settings.ts";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";

// Diagnostic probe: nothing heavy loads at module scope, so the plugin always loads and
// each failure is shown on the card with the phone's own message and stack.

const SAMPLE_CODE = `// probe: highlighter
export async function greet(name: string): Promise<string> {
  const n = 42;
  return \`hello \${name} \${n}\`;
}`;

declare const __PROBE_BUILD__: string;
const FALLBACK_THEME = "one";

type Highlight = typeof import("@getpaseo/highlight");
type Loaded<T> = { ok: true; value: T } | { ok: false; error: string } | null;

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.message}\n${String(e.stack ?? "").split("\n").slice(0, 12).join("\n")}`;
  return String(e);
}

function engineTest(body: string, expected: string): string {
  try {
    const got = String(new Function(body)());
    return got === expected ? `ok (${got})` : `WRONG: got ${got}, expected ${expected}`;
  } catch (e) {
    return `THROWS: ${e instanceof Error ? e.message : String(e)}`;
  }
}

const ENGINE_TESTS: [string, string, string][] = [
  ["class extends", "class A{f(){return 1}} class B extends A{} return new B().f()", "1"],
  ["extends undefined msg", "var U; try { class C extends U {} } catch (e) { return e.message } return 'none'", "?"],
  ["per-loop let", "var fs=[]; for (let i=0;i<3;i++) fs.push(function(){return i}); return fs.map(function(f){return f()}).join()", "0,1,2"],
  ["block shadow", "let x=1; { let x=2; } return x", "1"],
  ["class in block", "var K = 0; { class K2 {} K = typeof K2 } return K", "function"],
];

function isDark(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return true;
  const v = Number.parseInt(m[1], 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255) < 128;
}

// esbuild marks a lazy module initialised before its body runs, so a second import()
// after a failed first one resolves with half-initialised exports. Load once and keep
// the first outcome so every mount shows the real error.
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= load());
}
const loadHighlight = once(() => import("@getpaseo/highlight"));
const loadMermaidPart = once(() => import("./mermaid-part.tsx").then((m) => m.MermaidPart));

function useLazy<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>(null);
  useEffect(() => {
    load().then(
      (value) => setState({ ok: true, value }),
      (e) => setState({ ok: false, error: describe(e) }),
    );
  }, []);
  return state;
}

function useStoredSettings(): { settings: StoredAppSettings; debug: string } {
  const state = useLazy(readAppSettings);
  const empty = { syntaxTheme: null, theme: null };
  if (state === null) return { settings: empty, debug: "reading AsyncStorage…" };
  if (!state.ok) return { settings: empty, debug: `AsyncStorage read FAILED: ${state.error}` };
  return { settings: state.value, debug: "read from AsyncStorage @paseo:app-settings" };
}

export function RenderProbe({ theme }: PluginTimelineItemProps) {
  const scheme = isDark(theme.colors.surface0) ? "dark" : "light";
  const { settings, debug: themeDebug } = useStoredSettings();
  const appTheme = settings.syntaxTheme;
  const linkColor = linkColorFor(settings.theme, scheme, theme.colors.accent);
  const hl = useLazy<Highlight>(loadHighlight);
  const mm = useLazy<ComponentType<{ scheme: "light" | "dark"; muted: object }>>(loadMermaidPart);
  const engine = useMemo(() => ENGINE_TESTS.map(([name, body, want]) => `${name}: ${engineTest(body, want)}`), []);

  const fg = theme.colors.foreground;
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const danger = { color: theme.colors.statusDanger, fontSize: 12 };

  let code: ReactNode;
  if (hl === null) code = <Text style={muted}>highlighter: loading…</Text>;
  else if (!hl.ok) code = <Text selectable style={danger}>highlighter FAILED:{"\n"}{hl.error}</Text>;
  else {
    try {
      const id = appTheme && hl.value.isSyntaxThemeId(appTheme) ? appTheme : FALLBACK_THEME;
      const colors = hl.value.resolveSyntaxColors(id as never, scheme);
      const lines = hl.value.highlightCode(SAMPLE_CODE, "probe.ts");
      code = (
        <View style={{ gap: 4 }}>
          <Text selectable style={muted}>
            code theme: {appTheme ?? `${FALLBACK_THEME} (fallback)`}
            {"\n"}app theme: {settings.theme ?? "(unset)"} · surface looks {scheme}
            {"\n"}settings: {themeDebug}
          </Text>
          <Text selectable style={{ color: theme.colors.foreground, fontSize: 14 }}>
            Sample{" "}
            <Text style={{ color: linkColor }}>link in app-theme colour {linkColor}</Text>
          </Text>
          <View style={{ backgroundColor: theme.colors.surface1, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 8, padding: 12 }}>
            <Text selectable style={{ fontFamily: "monospace", fontSize: 13, color: fg }}>
              {lines.map((tokens, i) => (
                <Text key={i}>
                  {tokens.map((t, j) => (
                    <Text key={j} style={{ color: t.style ? colors[t.style] : fg }}>
                      {t.text}
                    </Text>
                  ))}
                  {i < lines.length - 1 ? "\n" : ""}
                </Text>
              ))}
            </Text>
          </View>
        </View>
      );
    } catch (e) {
      code = <Text selectable style={danger}>highlight call FAILED:{"\n"}{describe(e)}</Text>;
    }
  }

  let diagram: ReactNode;
  if (mm === null) diagram = <Text style={muted}>mermaid part: loading…</Text>;
  else if (!mm.ok) diagram = <Text selectable style={danger}>mermaid part FAILED:{"\n"}{mm.error}</Text>;
  else {
    const Part = mm.value;
    diagram = <Part scheme={scheme} muted={muted} />;
  }

  return (
    <View style={{ gap: 10 }}>
      <Text selectable style={muted}>
        build: {__PROBE_BUILD__}
      </Text>
      <Text selectable style={muted}>
        engine:{"\n"}{engine.join("\n")}
      </Text>
      {code}
      {diagram}
    </View>
  );
}
