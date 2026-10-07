import { getPaseoClient, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Icon } from "@getpaseo/plugin/client/react-native";
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Alert,
  Linking,
  Pressable,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { agentLinkTarget } from "../shared/agent-link.ts";
import { formatMessageTimestamp } from "../shared/message-time.ts";
import {
  findPaneHandler,
  localFilePath,
  workspaceFileLinkUrl,
  workspaceFileRoute,
  workspaceFileRouteFromPath,
  type FiberLike,
  type PaneHandlerSearch,
} from "../shared/file-link.ts";
import { isWeb } from "./vendor/constants/platform.ts";
import type { ASTNode, RenderRules } from "react-native-markdown-display";
import { setMessageFootnotes } from "../shared/extensions.ts";
import { texToUnicode } from "../shared/tex-unicode.ts";
import { DEFAULT_CONTENT_FONT_SIZE, useStoredSettings } from "./app-settings.ts";
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
import {
  applySemanticRules,
  prepareSemanticSource,
  setCardDefinitions,
  type SemanticKind,
  type SpikeData,
} from "../shared/spike.ts";
import { AudioOpenFileContext, SemanticAudio } from "./semantic-audio.tsx";

// Style objects/arrays and the positional block key are deliberate render-time
// allocations (same rationale as the app's react-perf override): they read the live
// theme during render, so hoisting them would capture a stale one.
// oxlint-disable react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-object-as-prop, react/no-array-index-key

// --- semantic presentation (finalized design: theme-aware kind palettes) ---

const palettes: Record<"light" | "dark", Record<SemanticKind, string>> = {
  light: {
    ask: "#7c3aed",
    done: "#15803d",
    deferred: "#7c5c3b",
    warning: "#b45309",
    danger: "#b91c1c",
    info: "#1d4ed8",
    muted: "#64748b",
  },
  dark: {
    ask: "#c4b5fd",
    done: "#86efac",
    deferred: "#d6b98c",
    warning: "#fcd34d",
    danger: "#fca5a5",
    info: "#93c5fd",
    muted: "#94a3b8",
  },
};

const icons: Record<SemanticKind, string> = {
  ask: "MessageCircleQuestion",
  done: "CircleCheck",
  deferred: "Clock",
  warning: "TriangleAlert",
  danger: "CircleX",
  info: "Info",
  muted: "CircleMinus",
};

const kindLabels: Record<SemanticKind, string> = {
  ask: "Ask",
  done: "Done",
  deferred: "Deferred",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
  muted: "Muted",
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
  theme: Theme;
  children: ReactNode;
}

function SemanticCallout({
  kind,
  title,
  fold,
  color,
  surfaceTint,
  border,
  theme,
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
        <CalloutFooter theme={theme} />
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
      <CalloutFooter theme={theme} />
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

// --- callout card footer -------------------------------------------------------

// The message's timestamp and full markdown, for the footer row at the bottom of
// every callout card. SemanticMarkdown provides them; the renderer rules sit
// several calls deep, so a context carries them instead of threading props
// (same shape as AudioOpenFileContext in semantic-audio.tsx).
interface CalloutMessage {
  timestamp: Date;
  text: string;
}
const CalloutMessageContext = createContext<CalloutMessage | null>(null);

// The app's user-message footer geometry (message.tsx: trailingRow + timestampText,
// and TurnCopyButton with the user-message copyButton override): gap/marginTop
// spacing[2], copy button padding spacing[1] with a -spacing[1] right edge, 24px row.
// The metadata text 13 (STREAM_METADATA_FONT_SIZE) and icon 14 (ICON_SIZE.sm) sit
// against the app's default content size, so they scale by
// contentFontSize / default (16 native, 15 web — DEFAULT_CONTENT_FONT_SIZE) to
// track the chat text setting. Colours come from the theme, never hard-coded.
const CALLOUT_TIME_PX = 13;
const CALLOUT_COPY_ICON_PX = 14;

function scaleToContentSize(appPx: number, contentSize: number): number {
  return Math.round((appPx * contentSize) / DEFAULT_CONTENT_FONT_SIZE);
}

const calloutFooterStyles = {
  row: {
    alignSelf: "flex-end" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    height: 24,
    gap: 8, // theme.spacing[2]
    marginTop: 8, // theme.spacing[2]
  },
  copyButton: {
    alignSelf: "center" as const,
    padding: 4, // theme.spacing[1]
    paddingTop: 4, // theme.spacing[1]
    marginTop: 0,
    marginRight: -4, // -theme.spacing[1]
  },
} satisfies Record<string, ViewStyle>;

// Mirrors the app's TurnCopyButton: copy → check for 1.5s, muted icon that
// lightens on hover (web only; hovered stays false on native).
function CalloutFooter({ theme }: { theme: Theme }) {
  const message = useContext(CalloutMessageContext);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!message?.text) return;
    try {
      await copyText(message.text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 1500);
    } catch (error) {
      console.warn("[semantic-markdown] callout copy failed", error);
    }
  }, [message]);

  if (!message) return null;
  return (
    <View style={calloutFooterStyles.row}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: scaleToContentSize(CALLOUT_TIME_PX, theme.fontSize.content),
        }}
      >
        {formatMessageTimestamp(message.timestamp)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? "Copied" : "Copy message"}
        onPress={handleCopy}
        style={calloutFooterStyles.copyButton}
      >
        {({ hovered }) => (
          <Icon
            name={copied ? "Check" : "Copy"}
            size={scaleToContentSize(CALLOUT_COPY_ICON_PX, theme.fontSize.content)}
            color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
          />
        )}
      </Pressable>
    </View>
  );
}

// --- semantic status strip -----------------------------------------------------

// Copied from the app's native info notification strip (message.tsx
// notificationStylesheet): flat blue-300 tint, no border, no shadow.
const STATUS_INFO_BACKGROUND = "rgba(147, 197, 253, 0.1)";
const STATUS_ICON_BLUE = "#93c5fd";

function SemanticStatus({ theme, children }: { theme: Theme; children: ReactNode }) {
  return (
    <View
      style={[
        statusStripStyles.card,
        { borderRadius: theme.borderRadius.md, marginBottom: theme.spacing[1] },
      ]}
    >
      <View style={{ paddingHorizontal: theme.spacing[3], paddingVertical: 10 }}>
        <View style={[statusStripStyles.row, { gap: theme.spacing[2] }]}>
          <View style={statusStripStyles.icon}>
            <Icon name="Info" size={16} color={STATUS_ICON_BLUE} />
          </View>
          <View style={statusStripStyles.textContainer}>{children}</View>
        </View>
      </View>
    </View>
  );
}

const statusStripStyles = {
  card: { overflow: "hidden" as const, backgroundColor: STATUS_INFO_BACKGROUND },
  row: { flexDirection: "row" as const, alignItems: "flex-start" as const },
  icon: { flexShrink: 0 as const, height: 20, justifyContent: "center" as const },
  textContainer: { flex: 1 },
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

function tableCellFlex(node: ASTNode): ViewStyle | undefined {
  const flex = Number(node.attributes?.["data-semantic-flex"]);
  return Number.isFinite(flex) && flex > 0 ? { flex } : undefined;
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
        (p) =>
          p.type === "semantic_text" ||
          p.type === "semantic_highlight" ||
          p.type === "semantic_inline" ||
          p.type === "semantic_status",
      );
      if (owner?.type === "semantic_status") {
        // Native strip messageText: foreground, theme base size, fixed 20 line height.
        return (
          <MarkdownInheritedText
            key={node.key}
            inheritedStyles={inheritedStyles}
            textStyle={{
              color: ctx.theme.colors.foreground,
              fontSize: ctx.theme.fontSize.base,
              lineHeight: 20,
            }}
          >
            {node.content}
          </MarkdownInheritedText>
        );
      }
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
    // Paired `{kind}content{/kind}`: colour only. No background, no box metrics,
    // so the span never changes line layout.
    semantic_inline: (
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
          textStyle={{ color: palette[kind] }}
        >
          {children}
        </MarkdownInheritedText>
      );
    },
    semantic_status: (node: ASTNode, children: ReactNode[], _p: ASTNode[], _s: MarkdownStyles) => (
      <SemanticStatus key={node.key} theme={ctx.theme}>
        {children}
      </SemanticStatus>
    ),
    semantic_audio: (node: ASTNode) => (
      <SemanticAudio
        key={node.key}
        path={String(node.sourceMeta?.path ?? "")}
        label={String(node.sourceMeta?.label ?? "")}
        theme={ctx.theme}
      />
    ),
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
          theme={ctx.theme}
        >
          {children}
        </SemanticCallout>
      );
    },
    semantic_card_ref: (node: ASTNode) => (
      <SemanticCardReference
        key={node.key}
        source={String(node.sourceMeta?.source ?? "")}
        theme={ctx.theme}
        dark={ctx.dark}
      />
    ),
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
          style={[styles._VIEW_SAFE_th, tableCellFlex(node)]}
          dataSet={markdownCopyTableCellDataSet("th", node.attributes?.style)}
        >
          {children}
        </View>
      </MarkdownTableCellText>
    ),
    td: (node: ASTNode, children: ReactNode[], _p: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTableCellText key={node.key}>
        <View
          style={[styles._VIEW_SAFE_td, tableCellFlex(node)]}
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

function createRendererRules(theme: Theme, dark: boolean): RenderRules {
  return {
    ...createSharedMarkdownRules({ theme, dark }),
    ...createAssistantCopyRules(),
    ...createSemanticMarkdownRules({ theme, dark }),
  };
}

function SemanticCardReference({
  source,
  theme,
  dark,
}: {
  source: string;
  theme: Theme;
  dark: boolean;
}) {
  const parser = useMemo(() => applySemanticRules(createAssistantMarkdownParser()), []);
  const prepared = useMemo(() => prepareSemanticSource(source), [source]);
  const rules = useMemo(() => createRendererRules(theme, dark), [theme, dark]);
  const definitionKey = useMemo(() => {
    setMessageFootnotes(parser, source);
    setCardDefinitions(parser, prepared.cardDefinitions);
    return JSON.stringify([...prepared.cardDefinitions]);
  }, [parser, prepared.cardDefinitions, source]);

  return (
    <MarkdownRenderer
      key={definitionKey}
      text={prepared.text}
      theme={theme}
      dark={dark}
      rules={rules}
      markdownit={parser}
      onLinkPress={useContext(LinkPressContext)}
    />
  );
}

// --- links ---------------------------------------------------------------------

// Paseo's chat renderer opens path links through an app-internal file-link action that
// plugins cannot reach, and the SDK's openExternalUrl opens http(s) only. Local file links
// deep-link to the agent's workspace instead (see shared/file-link.ts); every other link
// returns true and keeps the renderer's default openExternalUrl path.
const LinkPressContext = createContext<((href: string) => boolean) | undefined>(undefined);

let linkClicks = 0;

// The plugin cannot import Paseo's pane context, but it renders inside the provider.
// This probe reads the provider value off the fiber chain at mount (see findPaneHandler)
// and hands it to the press handler, so a path-link tap calls Paseo's own
// openFileInWorkspace and behaves exactly like the app's chat link.
class PaneHandlerProbe extends Component<{ onFound: (search: PaneHandlerSearch) => void }> {
  componentDidMount(): void {
    let search: PaneHandlerSearch = { handler: null, walked: 0 };
    try {
      const internals = this as unknown as {
        _reactInternals?: FiberLike;
        _reactInternalFiber?: FiberLike;
      };
      const fiber = internals._reactInternals ?? internals._reactInternalFiber;
      if (fiber) search = findPaneHandler(fiber);
    } catch (error) {
      console.warn("[semantic-markdown] pane handler walk failed", error);
    }
    this.props.onFound(search);
  }

  render(): ReactNode {
    return null;
  }
}

async function openWorkspaceFile(serverId: string, agentId: string, href: string, click: number) {
  try {
    if (isWeb) {
      // Desktop: the page address already names the server and workspace. The agent
      // lookup below never settled on desktop (2026-09-28), so skip it here.
      const route = workspaceFileRouteFromPath(window.location.pathname, href, click);
      if (!route) {
        console.warn("[semantic-markdown] file link: not on a workspace page", href);
        return;
      }
      window.history.pushState(null, "", route);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return;
    }
    const agent = getPaseoClient(serverId).agents.ref(agentId);
    const refreshed = await Promise.race([
      agent.refresh().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    if (!refreshed) {
      console.warn("[semantic-markdown] file link: agent lookup timed out", href);
      return;
    }
    const input = { serverId, workspaceId: agent.workspaceId ?? undefined, href };
    const route = workspaceFileRoute(input);
    if (!route) {
      console.warn("[semantic-markdown] no workspace for file link", href);
      return;
    }
    await Linking.openURL(workspaceFileLinkUrl(input, click) ?? "");
  } catch (error) {
    console.warn("[semantic-markdown] file link failed", href, error);
  }
}

// The agent route resolves the agent itself (prepareAgentRoute + fetchAgent in the app's
// [agentId].tsx), so no workspace lookup is needed before navigating.
function agentRoute(serverId: string, agentId: string): string {
  return `/h/${encodeURIComponent(serverId)}/agent/${encodeURIComponent(agentId)}`;
}

function openAgentTab(serverId: string, agentId: string) {
  const route = agentRoute(serverId, agentId);
  if (isWeb) {
    // Desktop: re-enter the app through its own agent route with a full document
    // navigation. createWindow cold-starts agent windows at exactly this path
    // (paseo://app + /h/<server>/agent/<id>), and the route resolves the agent and
    // redirects into its tab. A history pushState cannot be used: expo-router's
    // history fork derives the current position from window.history.state.id, so a
    // foreign entry with null state reads as index 0 and the synthetic popstate is
    // handled as a backward jump — resetRoot to an unreconcilable state, blank pane.
    window.location.assign(route);
    return;
  }
  void Linking.openURL(`paseo://${route}`).catch((error) =>
    console.warn("[semantic-markdown] agent link failed", route, error),
  );
}

// The client talks to one daemon at a time, so a full-form link naming any other server
// cannot be followed here. No plugin toast exists in the SDK; RN Alert (already a
// dependency) covers native, window.alert covers the desktop renderer.
function alertNotConnected(serverId: string) {
  const message = `Not connected to server ${serverId}.`;
  console.warn("[semantic-markdown] agent link:", message);
  if (isWeb) {
    window.alert(message);
  } else {
    Alert.alert("Paseo", message);
  }
}

// --- component -----------------------------------------------------------------

export function SemanticMarkdown({
  item,
  timestamp,
  theme: pluginTheme,
  host,
  agentId,
}: PluginTimelineItemProps<SpikeData>) {
  const settings = useStoredSettings();
  const theme = useMemo(() => themeFromPlugin(pluginTheme, settings), [pluginTheme, settings]);
  const dark = useMemo(() => isDarkSurface(pluginTheme.colors.surface0), [pluginTheme]);

  const markdownParser = useMemo(() => applySemanticRules(createAssistantMarkdownParser()), []);
  // The last block always uses the streaming parser: without a phase signal
  // from the timeline item this keeps incomplete tail syntax (half a fence,
  // unclosed emphasis) rendering gracefully during live streams, and it is a
  // no-op for complete text.
  const streamingMarkdownParser = useMemo(
    () => applySemanticRules(createAssistantMarkdownParser({ streaming: true }), true),
    [],
  );

  const prepared = useMemo(() => prepareSemanticSource(item.data.text), [item.data.text]);
  const blocks = useMemo(() => splitMarkdownBlocks(prepared.text), [prepared.text]);
  // Each block parses on its own, so footnote numbers come from the whole message.
  // The numbering goes in the block keys: a block whose text did not change must
  // still re-parse when a definition streams in later.
  const footnoteKey = useMemo(() => {
    setMessageFootnotes(markdownParser, item.data.text);
    setMessageFootnotes(streamingMarkdownParser, item.data.text);
    setCardDefinitions(markdownParser, prepared.cardDefinitions);
    setCardDefinitions(streamingMarkdownParser, prepared.cardDefinitions);
    return [
      ...((markdownParser as { footnoteIndices?: Map<string, number> }).footnoteIndices ?? []),
      ...prepared.cardDefinitions,
    ].join();
  }, [markdownParser, streamingMarkdownParser, item.data.text, prepared.cardDefinitions]);
  const rules = useMemo(() => createRendererRules(theme, dark), [theme, dark]);
  const messageContext = useMemo(
    () => ({ timestamp, text: item.data.text }),
    [timestamp, item.data.text],
  );
  const paneSearchRef = useRef<PaneHandlerSearch>({ handler: null, walked: 0 });
  const rememberPaneHandler = useCallback((search: PaneHandlerSearch) => {
    paneSearchRef.current = search;
  }, []);
  // One open path for file-link taps and audio-pill fallbacks alike: the pane
  // handler when present, the workspace deep link otherwise.
  const openLocalFile = useCallback(
    (path: string) => {
      linkClicks += 1;
      const click = linkClicks;
      const pane = paneSearchRef.current.handler;
      if (pane) {
        try {
          pane.openFileInWorkspace({ location: { path }, disposition: "preferred" });
          return;
        } catch (error) {
          console.warn("[semantic-markdown] pane handler failed", error);
        }
      }
      console.warn(
        `[semantic-markdown] no pane handler (walked ${paneSearchRef.current.walked}), deep link`,
      );
      void openWorkspaceFile(host.id, agentId, path, click);
    },
    [host.id, agentId],
  );

  const handleLinkPress = useCallback(
    (href: string) => {
      const agent = agentLinkTarget(href, host.id);
      if (agent) {
        if (agent.kind === "other-server") {
          alertNotConnected(agent.serverId);
        } else {
          void openAgentTab(agent.serverId, agent.agentId);
        }
        return false;
      }
      const path = localFilePath(href.trim());
      if (!path) return true;
      openLocalFile(path);
      return false;
    },
    [host.id, openLocalFile],
  );

  return (
    <LinkPressContext.Provider value={handleLinkPress}>
      <AudioOpenFileContext.Provider value={openLocalFile}>
        <CalloutMessageContext.Provider value={messageContext}>
          <View>
            <PaneHandlerProbe onFound={rememberPaneHandler} />
            {blocks.map((block, index) => (
              <MarkdownRenderer
                key={`block:${index}:${footnoteKey}`}
                text={block}
                theme={theme}
                dark={dark}
                rules={rules}
                markdownit={index === blocks.length - 1 ? streamingMarkdownParser : markdownParser}
                onLinkPress={handleLinkPress}
              />
            ))}
          </View>
        </CalloutMessageContext.Provider>
      </AudioOpenFileContext.Provider>
    </LinkPressContext.Provider>
  );
}
