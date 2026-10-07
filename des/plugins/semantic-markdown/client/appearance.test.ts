import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import vm from "node:vm";
import { build, type Plugin } from "esbuild";
import type { PluginTheme } from "@getpaseo/plugin";
import type { StoredAppSettings } from "./app-settings.ts";
import type { Theme } from "./vendor/styles/theme.ts";

// The client modules read react-native (Platform, native storage modules) at
// module scope. Stub just enough to evaluate the pure typography paths, the same
// way spike.test.ts loads the WebView adapter.
const stubPlugin: Plugin = {
  name: "appearance-test-stubs",
  setup(context) {
    context.onResolve({ filter: /^react-native$/ }, () => ({
      path: "react-native",
      namespace: "stub",
    }));
    context.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
    context.onLoad({ filter: /^react-native$/, namespace: "stub" }, () => ({
      contents: [
        "const platform = globalThis.__TEST_PLATFORM__;",
        "export const Platform = {",
        "  OS: platform,",
        "  select: (options) => options[platform] ?? options.default,",
        "};",
        "export const NativeModules = {};",
        "export const TurboModuleRegistry = { get: () => null };",
      ].join("\n"),
      loader: "js",
    }));
    context.onLoad({ filter: /^react$/, namespace: "stub" }, () => ({
      contents: "export const useSyncExternalStore = () => undefined;",
      loader: "js",
    }));
  },
};

// vm objects live in another realm; normalize before strict deep comparisons.
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function loadModule(entry: string, platform = "ios"): Promise<Record<string, unknown>> {
  const result = await build({
    entryPoints: [join(import.meta.dirname, entry)],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    plugins: [stubPlugin],
  });
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    __TEST_PLATFORM__: platform,
  });
  return module.exports;
}

const appSettings = (await loadModule("app-settings.ts")) as unknown as {
  parseStoredAppSettings(raw: string | null): StoredAppSettings;
  DEFAULT_STORED_APP_SETTINGS: StoredAppSettings;
};
const webAppSettings = (await loadModule("app-settings.ts", "web")) as unknown as {
  DEFAULT_STORED_APP_SETTINGS: StoredAppSettings;
};
const appearance = (await loadModule("vendor/styles/theme.ts")) as unknown as {
  themeFromPlugin(pluginTheme: PluginTheme, settings: StoredAppSettings): Theme;
  scaleFontSize(ui: number, content: number, code: number): Theme["fontSize"];
};
const markdownStyles = (await loadModule("vendor/styles/markdown-styles.ts")) as unknown as {
  createMarkdownStyles(theme: Theme): Record<string, Record<string, unknown>>;
};

const pluginTheme: PluginTheme = {
  colors: {
    surface0: "#000000",
    surface1: "#111111",
    surface2: "#222222",
    border: "#333333",
    foreground: "#ffffff",
    foregroundMuted: "#999999",
    accent: "#00ff00",
    accentForeground: "#000000",
    statusSuccess: "#00ff00",
    statusWarning: "#ffff00",
    statusDanger: "#ff0000",
  },
};

test("stored typography defaults match the platform defaults", () => {
  assert.deepEqual(plain(appSettings.DEFAULT_STORED_APP_SETTINGS), {
    syntaxTheme: null,
    theme: null,
    uiFontFamily: "",
    monoFontFamily: "",
    uiBaseFontSize: 15,
    contentFontSize: 16,
    codeFontSize: 12,
  });
  assert.deepEqual(
    appSettings.parseStoredAppSettings(null),
    appSettings.DEFAULT_STORED_APP_SETTINGS,
  );
  assert.equal(webAppSettings.DEFAULT_STORED_APP_SETTINGS.uiBaseFontSize, 14);
  assert.equal(webAppSettings.DEFAULT_STORED_APP_SETTINGS.contentFontSize, 15);
  assert.equal(webAppSettings.DEFAULT_STORED_APP_SETTINGS.codeFontSize, 12);
});

test("stored typography is validated and clamped", () => {
  const parsed = appSettings.parseStoredAppSettings(
    JSON.stringify({
      theme: "dark",
      syntaxTheme: "one",
      uiFontFamily: "  Inter  ",
      monoFontFamily: "Fira Code",
      uiBaseFontSize: 99,
      contentFontSize: 5,
      codeFontSize: "14.7",
    }),
  );
  assert.deepEqual(plain(parsed), {
    syntaxTheme: "one",
    theme: "dark",
    uiFontFamily: "Inter",
    monoFontFamily: "Fira Code",
    uiBaseFontSize: 21,
    contentFontSize: 10,
    codeFontSize: 14,
  });
});

test("stored typography rejects bad families and corrupt blobs", () => {
  const parsed = appSettings.parseStoredAppSettings(
    JSON.stringify({
      uiFontFamily: "bad;font{}",
      monoFontFamily: 42,
      uiBaseFontSize: "abc",
      codeFontSize: 500,
    }),
  );
  assert.equal(parsed.uiFontFamily, "");
  assert.equal(parsed.monoFontFamily, "");
  assert.equal(parsed.uiBaseFontSize, 15);
  assert.equal(parsed.codeFontSize, 22);

  const corrupt = appSettings.parseStoredAppSettings("{not json");
  assert.deepEqual(plain(corrupt), plain(appSettings.DEFAULT_STORED_APP_SETTINGS));
});

test("missing content size inherits the UI base and legacy scale converts", () => {
  const inherited = appSettings.parseStoredAppSettings(JSON.stringify({ uiBaseFontSize: 18 }));
  assert.equal(inherited.contentFontSize, 18);
  // A stored blob with no content key inherits the (default) UI base, 15 — unlike
  // the no-blob default of 16 from DEFAULT_CLIENT_SETTINGS.
  assert.equal(appSettings.parseStoredAppSettings("{}").contentFontSize, 15);

  const invalid = appSettings.parseStoredAppSettings(JSON.stringify({ contentFontSize: "nope" }));
  assert.equal(invalid.contentFontSize, 16);

  const legacy = appSettings.parseStoredAppSettings(JSON.stringify({ uiFontSize: 16 }));
  assert.equal(legacy.uiBaseFontSize, 14);
  assert.equal(legacy.contentFontSize, 14);
});

test("themeFromPlugin derives the app font ramp", () => {
  assert.deepEqual(plain(appearance.scaleFontSize(14, 15, 12)), {
    sm: 12,
    base: 14,
    lg: 16,
    xl: 18,
    "2xl": 20,
    "3xl": 22,
    "4xl": 26,
    content: 15,
    code: 12,
  });

  const defaults = appearance.themeFromPlugin(pluginTheme, appSettings.DEFAULT_STORED_APP_SETTINGS);
  assert.deepEqual(plain(defaults.fontSize), {
    sm: 13,
    base: 15,
    lg: 17,
    xl: 19,
    "2xl": 21,
    "3xl": 24,
    "4xl": 28,
    content: 16,
    code: 12,
  });
  assert.equal(defaults.fontFamily.ui, "system-ui");
  assert.equal(defaults.fontFamily.mono, "ui-monospace");

  // UI tiers scale from the base; content and code stay absolute.
  const custom = appearance.themeFromPlugin(pluginTheme, {
    ...appSettings.DEFAULT_STORED_APP_SETTINGS,
    uiFontFamily: "Inter",
    monoFontFamily: "   ",
    uiBaseFontSize: 21,
    contentFontSize: 10,
    codeFontSize: 22,
  });
  assert.deepEqual(plain(custom.fontSize), {
    sm: 18,
    base: 21,
    lg: 24,
    xl: 27,
    "2xl": 30,
    "3xl": 33,
    "4xl": 39,
    content: 10,
    code: 22,
  });
  assert.equal(custom.fontFamily.ui, "Inter");
  assert.equal(custom.fontFamily.mono, "ui-monospace");
});

test("tables keep the neutral page background when nested in tinted cards", () => {
  const theme = appearance.themeFromPlugin(pluginTheme, appSettings.DEFAULT_STORED_APP_SETTINGS);
  const styles = markdownStyles.createMarkdownStyles(theme);
  assert.equal(styles.table.backgroundColor, pluginTheme.colors.surface0);
});
