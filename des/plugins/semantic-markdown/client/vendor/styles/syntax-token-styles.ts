import { isSyntaxThemeId, resolveSyntaxColors, type HighlightStyle } from "@getpaseo/highlight";

/** The app's default code theme (0.9.2 use-settings/storage.ts). */
const DEFAULT_SYNTAX_THEME = "one";

export interface TokenStyle {
  color: string;
}

const styleEntries = (palette: Record<HighlightStyle, string>, foreground: string) => {
  const base: TokenStyle = { color: foreground };
  const styles: Record<string, TokenStyle> = { base };
  for (const [name, color] of Object.entries(palette)) styles[name] = { color };
  return styles;
};

// The app resolves colors through unistyles from the stored code theme; the plugin
// reads that stored theme itself and takes the dark flag from PluginTheme luminance.
export function syntaxTokenStylesFor(
  dark: boolean,
  foreground: string,
  syntaxTheme: string | null,
): Record<string, TokenStyle> {
  const id = syntaxTheme && isSyntaxThemeId(syntaxTheme) ? syntaxTheme : DEFAULT_SYNTAX_THEME;
  return styleEntries(resolveSyntaxColors(id, dark ? "dark" : "light"), foreground);
}

// Accepts a plain string so highlight tokens (typed HighlightStyle | null)
// share one path with server-typed string | null. Unknown styles fall back to
// the base color.
export function syntaxTokenStyleFor(
  styles: Record<string, TokenStyle>,
  style: string | null | undefined,
): TokenStyle {
  if (!style) return styles.base;
  return styles[style] ?? styles.base;
}

export type { HighlightStyle };
