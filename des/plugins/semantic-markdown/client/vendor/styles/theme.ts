import { linkColorFor, type StoredAppSettings } from "../../app-settings.ts";
import { Platform } from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";

// The authored scale values copied from packages/app/src/styles/theme.ts at
// v0.9.2 (tag == main for this closure). Inlined so vendored style code compiles
// without the app's unistyles theme machinery. Do not "fix" these to look nicer:
// in the app these exact numbers seed the runtime font ramp (apply.ts), so the
// vendored geometry constants stay authored while themeFromPlugin scales the
// theme tokens. See scaleFontSize below.
export const FONT_SIZE = {
  code: 12,
  content: 15,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  "2xl": 20,
  "3xl": 22,
  "4xl": 26,
} as const;

export const SPACING = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

export const BORDER_RADIUS = {
  none: 0,
  sm: 2,
  base: 4,
  md: 6,
  lg: 8,
  xl: 12,
  "2xl": 16,
  full: 9999,
} as const;

export const FONT_WEIGHT = {
  normal: "normal" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "bold" as const,
};

// Platform default stacks copied from 0.9.2 packages/app/src/styles/theme.ts.
const DEFAULT_UI_FONT_STACK = Platform.select({
  ios: "system-ui",
  default: "normal",
  web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
});

const DEFAULT_MONO_FONT_STACK = Platform.select({
  ios: "ui-monospace",
  default: "monospace",
  web: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
});

// The subset of the app's 863-LOC Theme that the vendored markdown closure
// actually consumes. Structurally compatible: vendored files typecheck against
// this and only touch these fields.
export interface Theme {
  colors: {
    foreground: string;
    foregroundMuted: string;
    accentBright: string;
    surface0: string;
    surface1: string;
    surface2: string;
    border: string;
  };
  fontSize: Record<keyof typeof FONT_SIZE, number>;
  fontWeight: typeof FONT_WEIGHT;
  fontFamily: { ui: string; mono: string };
  spacing: typeof SPACING;
  borderRadius: typeof BORDER_RADIUS;
}

// PluginTheme lacks the app's accentBright/syntax tokens; accent is the
// closest host-provided value. Visual parity is bounded by the SDK token set
// (VENDOR_PLAN risk 5).
// Relative luminance of a surface color, for picking light/dark palettes
// (syntax tokens, semantic kinds) when the SDK only exposes raw hex tokens.
// Unparseable values read as dark, matching the dark-app default.
export function isDarkSurface(surfaceHex: string): boolean {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(surfaceHex.trim());
  if (!match) return true;
  let hex = match[1];
  if (hex.length === 3) hex = hex.replace(/./g, (char) => char + char);
  const value = Number.parseInt(hex, 16);
  return (
    (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) /
      255 <
    0.5
  );
}

/**
 * The app's font-size ramp (packages/app/src/appearance/apply.ts): UI tiers
 * scale proportionally from the authored `FONT_SIZE` by uiBaseSize / base, while
 * `content` and `code` are absolute — separate semantic axes, never scaled.
 * Deriving from the authored ramp (not a live, already-scaled value) keeps
 * repeated derivations idempotent.
 */
export function scaleFontSize(
  uiBaseSize: number,
  contentSize: number,
  codeSize: number,
): Theme["fontSize"] {
  const r = uiBaseSize / FONT_SIZE.base;
  return {
    sm: Math.round(FONT_SIZE.sm * r),
    base: Math.round(FONT_SIZE.base * r),
    lg: Math.round(FONT_SIZE.lg * r),
    xl: Math.round(FONT_SIZE.xl * r),
    "2xl": Math.round(FONT_SIZE["2xl"] * r),
    "3xl": Math.round(FONT_SIZE["3xl"] * r),
    "4xl": Math.round(FONT_SIZE["4xl"] * r),
    content: contentSize,
    code: codeSize,
  };
}

export function themeFromPlugin(pluginTheme: PluginTheme, settings: StoredAppSettings): Theme {
  const c = pluginTheme.colors;
  const scheme = isDarkSurface(c.surface0) ? "dark" : "light";
  return {
    colors: {
      foreground: c.foreground,
      foregroundMuted: c.foregroundMuted,
      accentBright: linkColorFor(settings.theme, scheme, c.accent),
      surface0: c.surface0,
      surface1: c.surface1,
      surface2: c.surface2,
      border: c.border,
    },
    fontSize: scaleFontSize(
      settings.uiBaseFontSize,
      settings.contentFontSize,
      settings.codeFontSize,
    ),
    fontWeight: FONT_WEIGHT,
    fontFamily: {
      ui: (settings.uiFontFamily.trim() || DEFAULT_UI_FONT_STACK) ?? "system-ui",
      mono: (settings.monoFontFamily.trim() || DEFAULT_MONO_FONT_STACK) ?? "monospace",
    },
    spacing: SPACING,
    borderRadius: BORDER_RADIUS,
  };
}
