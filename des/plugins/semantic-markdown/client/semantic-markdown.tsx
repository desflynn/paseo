import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { setMessageFootnotes } from "../shared/extensions.ts";
import { texToUnicode } from "../shared/tex-unicode.ts";
import { useStoredSettings } from "./app-settings.ts";
import {
  createSharedMarkdownRules,
  MarkdownInheritedText,
  MarkdownRenderer,
  type MarkdownStyles,
} from "./vendor/components/markdown/renderer.tsx";
import { MarkdownParagraphView } from "./vendor/components/markdown-text.tsx";
import { MarkdownTableCellText } from "./vendor/components/markdown-text-selection.tsx";
import { getMarkdownListMarker, getMarkdownListSpacing } from "./vendor/utils/markdown-list.ts";
import {
  markdownCopyDataSet,
  markdownCopyOrderedListDataSet,
  markdownCopyTableCellDataSet,
} from "./vendor/assistant-selection-copy/markup.ts";
import { MarkdownTextSpan } from "./vendor/components/markdown-text.tsx";
import { isDarkSurface, themeFromPlugin, type Theme } from "./vendor/styles/theme.ts";
import { createAssistantMarkdownParser } from "./vendor/utils/assistant-markdown-parser.ts";
import { splitMarkdownBlocks } from "./vendor/utils/split-markdown-blocks.ts";
import { applySemanticRules, type SemanticKind, type SpikeData } from "../shared/spike.ts";

// Style objects/arrays and the positional block key are deliberate render-time
// allocations (same rationale as the app's react-perf override): they read the live
// theme during render, so hoisting them would capture a stale one.
// oxlint-disable react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-object-as-prop, react/no-array-index-key

// --- semantic presentation (finalized design: theme-aware kind palettes) ---

const palettes: Record<"light" | "dark", Record<SemanticKind, string>> = {
  light: {
    ask: "#7c3aed",
    done: "#15803d",
    deferred: "#475569",
    warning: "#b45309",
    danger: "#b91c1c",
    info: "#1d4ed8",
  },
  dark: {
    ask: "#c4b5fd",
    done: "#86efac",
    deferred: "#94a3b8",
    warning: "#fcd34d",
    danger: "#fca5a5",
    info: "#93c5fd",
  },
};

const icons: Record<SemanticKind, string> = {
  ask: "MessageCircleQuestion",
  done: "CircleCheck",
  deferred: "Clock",
  warning: "TriangleAlert",
  danger: "CircleX",
  info: "Info",
};

const kindLabels: Record<SemanticKind, string> = {
  ask: "Ask",
  done: "Done",
  deferred: "Deferred",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
};

// --- math -------------------------------------------------------------------

/** TeX rendered as Unicode text on every platform, so it stays selectable and copyable. */
function MathSpan({
  latex,
  textStyle,
}: {
  latex: string;
  display: boolean;
  textStyle: TextStyle;
  monoStyle: TextStyle;
}) {
  const text = useMemo(() => texToUnicode(latex), [latex]);
  return <MarkdownTextSpan style={textStyle}>{text}</MarkdownTextSpan>;
}

// --- semantic callout ---------------------------------------------------------

interface CalloutStateProps {
  kind: SemanticKind;
  title: string | null;
  fold: "open" | "collapsed" | null;
  color: string;
  surfaceTint: string;
  border: string;
  children: ReactNode;
}

function SemanticCallout({
  kind,
  title,
  fold,
  color,
  surfaceTint,
  border,
  children,
}: CalloutStateProps) {
  const [open, setOpen] = useState(fold !== "collapsed");
  const toggle = useCallback(() => setOpen((current) => !current), []);
  const label = title || kindLabels[kind];

  const header = (
    <View style={calloutStyles.header}>
      <Icon name={icons[kind]} size={16} color={color} />
      <MarkdownTextSpan style={{ color, fontSize: 15, fontWeight: "600", flex: 1, minWidth: 0 }}>
        {label}
      </MarkdownTextSpan>
      {fold ? <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={color} /> : null}
    </View>
  );

  if (!fold) {
    return (
      <View
        style={[
          calloutStyles.card,
          { borderColor: border, borderLeftColor: color, backgroundColor: surfaceTint },
        ]}
      >
        {header}
        <View style={calloutStyles.body}>{children}</View>
      </View>
    );
  }

  return (
    <View
      style={[
        calloutStyles.card,
        { borderColor: border, borderLeftColor: color, backgroundColor: surfaceTint },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} — ${open ? "collapse" : "expand"}`}
        onPress={toggle}
        style={calloutStyles.headerPressable}
      >
        {header}
      </Pressable>
      {open ? <View style={calloutStyles.body}>{children}</View> : null}
    </View>
  );
}

const calloutStyles = {
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 8,
    marginBottom: 12,
    overflow: "hidden" as const,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  // Column (default) so the header row stretches; a row here gave the title zero width.
  headerPressable: {},
  body: { paddingHorizontal: 10, paddingBottom: 8 },
} satisfies Record<string, ViewStyle>;

// --- kbd ----------------------------------------------------------------------

function Kbd({ text, style }: { text: string; style: TextStyle }) {
  return <MarkdownTextSpan style={[style, kbdStyle]}>{text}</MarkdownTextSpan>;
}

const kbdStyle: TextStyle = {
  fontFamily: "monospace",
  fontSize: 12,
  borderWidth: 1,
  borderRadius: 4,
  paddingHorizontal: 5,
  paddingVertical: 1,
};

// --- rules --------------------------------------------------------------------

function hexTint(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}

function createSemanticMarkdownRules(ctx: { theme: Theme; dark: boolean }): RenderRules {
  const scheme = ctx.dark ? "dark" : "light";
  const palette = palettes[scheme];
  const tint = ctx.dark ? "26" : "14";
  const surfaceTint = ctx.dark ? "1f" : "0f";

  return {
    // Leaf text takes its style from parent node *types* only, so a kind colour
    // set on a wrapper never reaches it. Look up the nearest tag or highlight here.
    text: (
      node: ASTNode,
      _c: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => {
      const owner = parent.find(
        (p) => p.type === "semantic_text" || p.type === "semantic_highlight",
      );
      const kind = owner?.sourceMeta?.kind as SemanticKind | undefined;
      return (
        <MarkdownInheritedText
          key={node.key}
          inheritedStyles={inheritedStyles}
          textStyle={styles.text}
          style={kind ? { color: palette[kind] } : undefined}
        >
          {node.content}
        </MarkdownInheritedText>
      );
    },
    semantic_text: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownParagraphView key={node.key} paragraphStyle={styles.paragraph} containsImage={false}>
        {children}
      </MarkdownParagraphView>
    ),
    semantic_highlight: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      _s: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => {
      const kind = (node.sourceMeta?.kind as SemanticKind) ?? "info";
      return (
        <MarkdownInheritedText
          key={node.key}
          inheritedStyles={inheritedStyles}
          textStyle={{ backgroundColor: hexTint(palette[kind], tint) }}
        >
          {children}
        </MarkdownInheritedText>
      );
    },
    semantic_callout: (node: ASTNode, children: ReactNode[], _p: ASTNode[], _s: MarkdownStyles) => {
      const kind = (node.sourceMeta?.kind as SemanticKind) ?? "info";
      return (
        <SemanticCallout
          key={node.key}
          kind={kind}
          title={typeof node.sourceMeta?.title === "string" ? node.sourceMeta.title : null}
          fold={(node.sourceMeta?.fold as "open" | "collapsed" | null) ?? null}
          color={palette[kind]}
          surfaceTint={hexTint(palette[kind], surfaceTint)}
          border={ctx.theme.colors.border}
        >
          {children}
        </SemanticCallout>
      );
    },
    // Leaf rules must merge inheritedStyles; styles.text alone has no colour (drew black).
    math_inline: (
      node: ASTNode,
      _c: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MathSpan
        key={node.key}
        latex={String(node.sourceMeta?.latex ?? node.content ?? "")}
        display={false}
        textStyle={{ ...inheritedStyles, ...styles.text }}
        monoStyle={styles.code_inline}
      />
    ),
    math_block: (
      node: ASTNode,
      _c: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <View key={node.key} style={mathBlockStyles.box}>
        <MathSpan
          latex={String(node.sourceMeta?.latex ?? node.content ?? "")}
          display
          textStyle={{ ...inheritedStyles, ...styles.text }}
          monoStyle={styles.fence}
        />
      </View>
    ),
    footnote_ref: (
      node: ASTNode,
      _c: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => {
      const index = node.sourceMeta?.index as number | null;
      if (index == null) {
        return (
          <MarkdownTextSpan key={node.key} style={{ ...inheritedStyles, ...styles.text }}>
            {`[^${String(node.sourceMeta?.label ?? "")}]`}
          </MarkdownTextSpan>
        );
      }
      return (
        // Unicode superscript digits: raised on every platform, still selectable.
        <MarkdownTextSpan
          key={node.key}
          style={{ color: ctx.theme.colors.accentBright, fontWeight: "600" }}
        >
          {texToUnicode(`^{${index}}`)}
        </MarkdownTextSpan>
      );
    },
    footnote_block: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      _styles: MarkdownStyles,
    ) => {
      const index = node.sourceMeta?.index as number | null;
      if (index == null) return null;
      return (
        <View key={node.key} style={footnoteBlockStyles.row}>
          <MarkdownTextSpan style={footnoteRefStyle(ctx.theme.colors.accentBright)}>
            {`${index}. `}
          </MarkdownTextSpan>
          <View style={footnoteBlockStyles.content}>{children}</View>
        </View>
      );
    },
    kbd: (node: ASTNode, _c: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <Kbd
        key={node.key}
        text={String(node.sourceMeta?.key ?? node.content ?? "")}
        style={styles.code_inline}
      />
    ),
  };
}

const mathBlockStyles = {
  box: { marginVertical: 8, alignItems: "center" as const },
};

function footnoteRefStyle(accent: string): TextStyle {
  return { color: accent, fontSize: 11, lineHeight: 16, fontWeight: "600" };
}

const footnoteBlockStyles = {
  row: { flexDirection: "row" as const, gap: 6, marginTop: 4 },
  content: { flex: 1, flexShrink: 1, minWidth: 0, opacity: 0.66 },
};

// --- assistant copy/selection rules (ported from the app's message.tsx) --------
// Every block the app's selection manager knows about carries the same
// data-paseo-* attributes, and inline marks route through MarkdownTextSpan so
// native selection composes. Selection/copy is blocking parity.

function createAssistantCopyRules(): RenderRules {
  const heading = (level: number) =>
    ((node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View
        key={node.key}
        style={styles[`_VIEW_SAFE_heading${level}`]}
        dataSet={markdownCopyDataSet[`h${level}` as keyof typeof markdownCopyDataSet]}
      >
        {children}
      </View>
    )) as RenderRules[string];

  return {
    heading1: heading(1),
    heading2: heading(2),
    heading3: heading(3),
    heading4: heading(4),
    heading5: heading(5),
    heading6: heading(6),
    blockquote: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View
        key={node.key}
        style={styles._VIEW_SAFE_blockquote}
        dataSet={markdownCopyDataSet.blockquote}
      >
        {children}
      </View>
    ),
    hr: (node: ASTNode, _c: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View key={node.key} style={styles._VIEW_SAFE_hr} dataSet={markdownCopyDataSet.hr} />
    ),
    table: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View key={node.key} style={styles._VIEW_SAFE_table} dataSet={markdownCopyDataSet.table}>
        {children}
      </View>
    ),
    thead: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View key={node.key} style={styles._VIEW_SAFE_thead} dataSet={markdownCopyDataSet.thead}>
        {children}
      </View>
    ),
    tbody: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View key={node.key} style={styles._VIEW_SAFE_tbody} dataSet={markdownCopyDataSet.tbody}>
        {children}
      </View>
    ),
    tr: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <View key={node.key} style={styles._VIEW_SAFE_tr} dataSet={markdownCopyDataSet.tr}>
        {children}
      </View>
    ),
    strong: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        copyTag="strong"
        inheritedStyles={inheritedStyles}
        textStyle={styles.strong}
      >
        {children}
      </MarkdownInheritedText>
    ),
    em: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        copyTag="em"
        inheritedStyles={inheritedStyles}
        textStyle={styles.em}
      >
        {children}
      </MarkdownInheritedText>
    ),
    s: (
      node: ASTNode,
      children: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        copyTag="s"
        inheritedStyles={inheritedStyles}
        textStyle={styles.s}
      >
        {children}
      </MarkdownInheritedText>
    ),
    code_inline: (
      node: ASTNode,
      _c: ReactNode[],
      _p: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        copyTag="code"
        inheritedStyles={inheritedStyles}
        textStyle={styles.code_inline}
        monoSurface
      >
        {node.content ?? ""}
      </MarkdownInheritedText>
    ),
    hardbreak: (node: ASTNode, _c: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTextSpan key={node.key} style={styles.hardbreak} copyTag="br">
        {"\n"}
      </MarkdownTextSpan>
    ),
    bullet_list: (
      node: ASTNode,
      children: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <View
        key={node.key}
        style={[styles.bullet_list, getMarkdownListSpacing(node, parent)]}
        dataSet={markdownCopyDataSet.ul}
      >
        {children}
      </View>
    ),
    ordered_list: (
      node: ASTNode,
      children: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <View
        key={node.key}
        style={[styles.ordered_list, getMarkdownListSpacing(node, parent)]}
        dataSet={markdownCopyOrderedListDataSet(node.attributes?.start)}
      >
        {children}
      </View>
    ),
    list_item: (
      node: ASTNode,
      children: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
    ) => {
      const { isOrdered, marker } = getMarkdownListMarker(node, parent);
      const iconStyle = isOrdered ? styles.ordered_list_icon : styles.bullet_list_icon;
      const contentStyle = isOrdered ? styles.ordered_list_content : styles.bullet_list_content;
      return (
        <View key={node.key} style={styles.list_item} dataSet={markdownCopyDataSet.li}>
          <Text style={iconStyle} dataSet={markdownCopyDataSet.listMarker}>
            {marker}
          </Text>
          <View style={[contentStyle, { flex: 1, flexShrink: 1, minWidth: 0 }]}>{children}</View>
        </View>
      );
    },
    th: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTableCellText key={node.key}>
        <View
          style={styles._VIEW_SAFE_th}
          dataSet={markdownCopyTableCellDataSet("th", node.attributes?.style)}
        >
          {children}
        </View>
      </MarkdownTableCellText>
    ),
    td: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTableCellText key={node.key}>
        <View
          style={styles._VIEW_SAFE_td}
          dataSet={markdownCopyTableCellDataSet("td", node.attributes?.style)}
        >
          {children}
        </View>
      </MarkdownTableCellText>
    ),
    paragraph: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownParagraphView
        key={node.key}
        paragraphStyle={styles.paragraph}
        containsImage={node.children?.some((child: ASTNode) => child.type === "image") ?? false}
      >
        {children}
      </MarkdownParagraphView>
    ),
  };
}

// --- component -----------------------------------------------------------------

export function SemanticMarkdown({ item, theme: pluginTheme }: PluginTimelineItemProps<SpikeData>) {
  const { theme: appTheme } = useStoredSettings();
  const theme = useMemo(() => themeFromPlugin(pluginTheme, appTheme), [pluginTheme, appTheme]);
  const dark = useMemo(() => isDarkSurface(pluginTheme.colors.surface0), [pluginTheme]);

  const markdownParser = useMemo(() => applySemanticRules(createAssistantMarkdownParser()), []);
  // The last block always uses the streaming parser: without a phase signal
  // from the timeline item this keeps incomplete tail syntax (half a fence,
  // unclosed emphasis) rendering gracefully during live streams, and it is a
  // no-op for complete text.
  const streamingMarkdownParser = useMemo(
    () => applySemanticRules(createAssistantMarkdownParser({ streaming: true })),
    [],
  );

  const blocks = useMemo(() => splitMarkdownBlocks(item.data.text), [item.data.text]);
  // Each block parses on its own, so footnote numbers come from the whole message.
  // The numbering goes in the block keys: a block whose text did not change must
  // still re-parse when a definition streams in later.
  const footnoteKey = useMemo(() => {
    setMessageFootnotes(markdownParser, item.data.text);
    setMessageFootnotes(streamingMarkdownParser, item.data.text);
    return [
      ...((markdownParser as { footnoteIndices?: Map<string, number> }).footnoteIndices ?? []),
    ].join();
  }, [markdownParser, streamingMarkdownParser, item.data.text]);
  const rules = useMemo(
    () => ({
      ...createSharedMarkdownRules({ theme, dark }),
      ...createAssistantCopyRules(),
      ...createSemanticMarkdownRules({ theme, dark }),
    }),
    [theme, dark],
  );

  return (
    <View>
      {blocks.map((block, index) => (
        <MarkdownRenderer
          key={`block:${index}:${footnoteKey}`}
          text={block}
          theme={theme}
          dark={dark}
          rules={rules}
          markdownit={index === blocks.length - 1 ? streamingMarkdownParser : markdownParser}
        />
      ))}
    </View>
  );
}
