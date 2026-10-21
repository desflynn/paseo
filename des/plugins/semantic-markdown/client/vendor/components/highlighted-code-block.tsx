import { useStoredSettings } from "../../app-settings.ts";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { copyText, Icon } from "@getpaseo/plugin/client/react-native";
import type { HighlightToken } from "@getpaseo/highlight";
import { isNative, isWeb } from "../constants/platform.ts";
import {
  syntaxTokenStyleFor,
  syntaxTokenStylesFor,
  type TokenStyle,
} from "../styles/syntax-token-styles.ts";
import { CODE_SURFACE_DATASET } from "../styles/code-surface.ts";
import { highlightToKeyedLines, type KeyedLine } from "../utils/highlight-cache.ts";
import {
  markdownCopyCodeBlockDataSet,
  markdownCopyDataSet,
  TRAILING_CODE_LINE_BREAKS,
} from "../assistant-selection-copy/markup.ts";
import { MarkdownTextSpan } from "./markdown-text.tsx";

interface HighlightedCodeBlockProps {
  code: string;
  language: string | null | undefined;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
  /** Dark-surface flag + foreground color replace the app's unistyles theme. */
  dark?: boolean;
}

// Fence info strings ("```ts", "```typescript", "```ts {1,3}") map to the
// extension-based parser table in @getpaseo/highlight. Aliases here only
// cover names that don't already match an extension key in parsers.ts.
const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  rust: "rs",
  golang: "go",
  "c++": "cpp",
  csharp: "cs",
  "c#": "cs",
  objc: "m",
  "objective-c": "m",
  markdown: "md",
  elixir: "ex",
};

function fenceLanguageToExtension(info: string | null | undefined): string | null {
  if (!info) return null;
  const first = info.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return null;
  const normalized = first.replace(/^\./, "");
  return LANGUAGE_ALIASES[normalized] ?? normalized;
}

function stripTerminalFenceNewline(code: string): string {
  return code.endsWith("\n") ? code.slice(0, -1) : code;
}

export const HighlightedCodeBlock = memo(function HighlightedCodeBlock({
  code,
  language,
  inheritedStyles,
  textStyle,
  dark = true,
}: HighlightedCodeBlockProps) {
  // Box styles (bg / padding / border / radius / margin) go on the wrapper View
  // so the absolute copy button positions relative to the visible code area,
  // not to a parent that includes the Text's own marginVertical.
  const { containerStyle, innerTextStyle } = useMemo(
    () => splitFenceStyle(inheritedStyles, textStyle),
    [inheritedStyles, textStyle],
  );
  const renderedCode = useMemo(() => stripTerminalFenceNewline(code), [code]);
  const copyDataSet = useMemo(
    () => ({ ...CODE_SURFACE_DATASET, ...markdownCopyCodeBlockDataSet(language) }),
    [language],
  );

  const keyedLines = useMemo<KeyedLine[] | null>(
    () => highlightToKeyedLines(renderedCode, fenceLanguageToExtension(language)),
    [renderedCode, language],
  );
  const { syntaxTheme } = useStoredSettings();
  const tokenStyles = useMemo(
    () => syntaxTokenStylesFor(dark, String(textStyle.color ?? "#ffffff"), syntaxTheme),
    [dark, textStyle.color, syntaxTheme],
  );

  // Hover-reveal is web-only; native always shows the controls (there is no
  // compact-form-factor hook in the plugin SDK, so compact stays false).
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const controlsVisible = isHovered || isNative;
  // Copy the code without its trailing blank lines. A fence body ends in a newline,
  // and ends in more than one when the author left a blank line before the closing
  // fence; pasting any of them into a terminal runs the last line.
  const getCode = useCallback(() => code.replace(TRAILING_CODE_LINE_BREAKS, ""), [code]);

  return (
    <View
      style={containerStyle}
      dataSet={isWeb ? copyDataSet : undefined}
      onPointerEnter={isWeb ? handlePointerEnter : undefined}
      onPointerLeave={isWeb ? handlePointerLeave : undefined}
    >
      {keyedLines ? (
        <MarkdownTextSpan style={innerTextStyle} copyTag="code">
          {renderCodeSegments(keyedLines, tokenStyles)}
        </MarkdownTextSpan>
      ) : (
        <MarkdownTextSpan style={innerTextStyle} copyTag="code">
          {renderedCode}
        </MarkdownTextSpan>
      )}
      <CopyButton getCode={getCode} visible={controlsVisible} />
    </View>
  );
});

function renderCodeSegments(keyedLines: KeyedLine[], tokenStyles: Record<string, TokenStyle>) {
  const segments: ReactNode[] = [];
  for (let lineIndex = 0; lineIndex < keyedLines.length; lineIndex += 1) {
    const line = keyedLines[lineIndex];
    if (lineIndex > 0) {
      segments.push(<CodeTextSpan key={`${line.key}-newline`} text={"\n"} />);
    }
    for (const { key, token } of line.tokens) {
      segments.push(
        <TokenSpan key={`${line.key}-${key}`} token={token} tokenStyles={tokenStyles} />,
      );
    }
  }
  return segments;
}

interface TokenSpanProps {
  token: HighlightToken;
  tokenStyles: Record<string, TokenStyle>;
}

const TokenSpan = memo(function TokenSpan({ token, tokenStyles }: TokenSpanProps) {
  return (
    <MarkdownTextSpan
      style={token.style ? syntaxTokenStyleFor(tokenStyles, token.style) : undefined}
    >
      {token.text}
    </MarkdownTextSpan>
  );
});

interface CodeTextSpanProps {
  text: string;
}

const CodeTextSpan = memo(function CodeTextSpan({ text }: CodeTextSpanProps) {
  return <MarkdownTextSpan>{text}</MarkdownTextSpan>;
});

interface SplitStyles {
  containerStyle: StyleProp<ViewStyle>;
  innerTextStyle: StyleProp<TextStyle>;
}

const CONTAINER_BASE: ViewStyle = { position: "relative" };
const WEB_SELECTABLE: TextStyle = isWeb ? ({ userSelect: "text" } as TextStyle) : {};

function splitFenceStyle(inheritedStyles: TextStyle, textStyle: TextStyle): SplitStyles {
  const { fontFamily, fontSize, color, ...box } = textStyle;
  const textOnly: TextStyle = { ...WEB_SELECTABLE };
  if (fontFamily !== undefined) textOnly.fontFamily = fontFamily;
  if (fontSize !== undefined) textOnly.fontSize = fontSize;
  if (fontSize !== undefined) textOnly.lineHeight = Math.round(fontSize * 1.45);
  if (color !== undefined) textOnly.color = color;
  return {
    containerStyle: [box as ViewStyle, CONTAINER_BASE],
    innerTextStyle: [inheritedStyles, textOnly],
  };
}

interface CopyButtonProps {
  getCode: () => string;
  visible: boolean;
}

const COPIED_RESET_MS = 1500;

const CopyButton = memo(function CopyButton({ getCode, visible }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
    },
    [],
  );

  const handlePress = useCallback(async () => {
    const content = getCode();
    if (!content) return;
    try {
      await copyText(content);
    } catch {
      return;
    }
    setCopied(true);
    if (resetRef.current) clearTimeout(resetRef.current);
    resetRef.current = setTimeout(() => {
      setCopied(false);
      resetRef.current = null;
    }, COPIED_RESET_MS);
  }, [getCode]);

  const visibilityStyle = visible ? copyButtonStyles.visible : copyButtonStyles.hidden;
  const wrapperStyle = useMemo(
    () => [copyButtonStyles.container, visibilityStyle],
    [visibilityStyle],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={wrapperStyle}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityRole="button"
      accessibilityLabel={copied ? "Copied" : "Copy code"}
      hitSlop={8}
      dataSet={isWeb ? markdownCopyDataSet.ignore : undefined}
    >
      {({ hovered }) => {
        const iconColor = hovered ? "#ffffff" : "#a1a1aa";
        return <Icon name={copied ? "Check" : "Copy"} size={14} color={iconColor} />;
      }}
    </Pressable>
  );
});

// theme.spacing[1] = 4, theme.spacing[2] = 8 (vendor/styles/theme.ts scale).
const SPACING_1 = 4;
const SPACING_2 = 8;

const copyButtonStyles = {
  container: {
    position: "absolute" as const,
    top: SPACING_2,
    right: SPACING_2,
    padding: SPACING_1,
  },
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
};
