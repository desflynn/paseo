// Vendor port: inline style arrays are deliberate render-time allocations (they read
// the live theme), matching the app's react-perf override for this renderer.
// oxlint-disable react-perf/jsx-no-new-array-as-prop
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Image,
  Pressable,
  Text,
  View,
  type ImageStyle,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import Markdown, {
  MarkdownIt,
  type ASTNode,
  type RenderRules,
} from "react-native-markdown-display";
import { HighlightedCodeBlock } from "../highlighted-code-block.tsx";
import { MarkdownFenceBlock } from "./fence/index.tsx";
import { MarkdownParagraphView, MarkdownTextSpan } from "../markdown-text.tsx";
import { MarkdownTableCellText } from "../markdown-text-selection.tsx";
import { getMarkdownListMarker, getMarkdownListSpacing } from "../../utils/markdown-list.ts";
import { markdownNodeContainsType } from "../../utils/markdown-ast.ts";
import { createMarkdownParser } from "../../utils/markdown-parser.ts";
import { createCompactMarkdownStyles, createMarkdownStyles } from "../../styles/markdown-styles.ts";
import type { Theme } from "../../styles/theme.ts";
import { isNative } from "../../constants/platform.ts";
import {
  splitHtmlishMarkdown,
  type MarkdownDisplayPart,
  type MarkdownInlineImagePart,
} from "./html-ish.ts";
import { resolveInlineImageSize, type InlineImageDimensions } from "./inline-image-size.ts";
import { groupMarkdownParts, type MarkdownPartGroup } from "./part-groups.ts";
import { colorMarkdownLinkChildren } from "./link-children.ts";
import { MarkdownLinkText } from "./link-text.tsx";
import { ImageLightbox, type ImageLightboxSource } from "../image-lightbox.tsx";
import type { MarkdownCopyInlineTag } from "../../assistant-selection-copy/markup.ts";
import { localFilePath } from "../../../../shared/file-link.ts";
import { readImageRpc, type ReadImageResult } from "../../../../shared/read-image.ts";

export type MarkdownStyles = Record<string, TextStyle & ViewStyle & { [key: string]: unknown }>;

interface MarkdownWithStableRendererProps {
  children: ReactNode;
  style: ReturnType<typeof createMarkdownStyles> | ReturnType<typeof createCompactMarkdownStyles>;
  rules?: RenderRules;
  markdownit?: ReturnType<typeof MarkdownIt>;
  onLinkPress?: (url: string) => boolean;
  allowedImageHandlers?: readonly string[];
  topLevelMaxExceededItem?: ReactNode;
}

const MarkdownWithStableRenderer = Markdown as ComponentType<MarkdownWithStableRendererProps>;

// Serves PR comment bodies and the markdown file preview; agent chat passes its
// own parser. The preview has to show the bytes on disk, so no typographer.
const defaultMarkdownParser = createMarkdownParser({ linkify: true });
const EMPTY_TEXT_STYLE: TextStyle = {};
const MARKDOWN_LIST_ITEM_CONTENT_FLEX: ViewStyle = { flex: 1, flexShrink: 1, minWidth: 0 };

/** Extra theme context the plugin needs where the app used unistyles. */
export interface MarkdownThemeContext {
  theme: Theme;
  dark: boolean;
}

export interface MarkdownRendererProps {
  text: string;
  theme: Theme;
  dark?: boolean;
  compact?: boolean;
  rules?: RenderRules;
  markdownit?: ReturnType<typeof MarkdownIt>;
  onLinkPress?: (url: string) => boolean;
  allowedImageHandlers?: readonly string[];
  topLevelMaxExceededItem?: ReactNode;
  enableHtmlish?: boolean;
}

export function MarkdownRenderer({
  text,
  theme,
  dark = true,
  compact = false,
  rules,
  markdownit = defaultMarkdownParser,
  onLinkPress,
  allowedImageHandlers,
  topLevelMaxExceededItem,
  enableHtmlish = true,
}: MarkdownRendererProps) {
  const markdownRules = useMemo(
    () => rules ?? createSharedMarkdownRules({ theme, dark }),
    [rules, theme, dark],
  );
  const parts = useMemo(
    () => (enableHtmlish ? splitHtmlishMarkdown(text) : [{ kind: "markdown" as const, text }]),
    [enableHtmlish, text],
  );
  const rendererProps = useMemo(
    () => ({
      compact,
      theme,
      dark,
      rules: markdownRules,
      markdownit,
      onLinkPress,
      allowedImageHandlers,
      topLevelMaxExceededItem,
    }),
    [
      allowedImageHandlers,
      compact,
      dark,
      markdownRules,
      markdownit,
      onLinkPress,
      theme,
      topLevelMaxExceededItem,
    ],
  );

  return <MarkdownPartList parts={parts} rendererProps={rendererProps} />;
}

type MarkdownPartRendererProps = Omit<MarkdownRendererProps, "text" | "enableHtmlish"> & {
  rules: RenderRules;
};

function MarkdownPartList({
  parts,
  rendererProps,
}: {
  parts: MarkdownDisplayPart[];
  rendererProps: MarkdownPartRendererProps;
}) {
  const keyedGroups = useMemo(() => keyMarkdownGroups(groupMarkdownParts(parts)), [parts]);
  return (
    <>
      {keyedGroups.map(({ key, group }) =>
        group.kind === "part" ? (
          <MarkdownPart key={key} part={group.part} rendererProps={rendererProps} />
        ) : (
          <MarkdownImageTextGroup key={key} group={group} rendererProps={rendererProps} />
        ),
      )}
    </>
  );
}

function keyMarkdownGroups(
  groups: MarkdownPartGroup[],
): { key: string; group: MarkdownPartGroup }[] {
  return groups.map((group, index) => ({ key: `${group.kind}:${index}`, group }));
}

function MarkdownPart({
  part,
  rendererProps,
}: {
  part: MarkdownDisplayPart;
  rendererProps: MarkdownPartRendererProps;
}) {
  if (part.kind === "details") {
    return <MarkdownDetails part={part} rendererProps={rendererProps} />;
  }

  if (part.kind === "inlineImage") {
    return <MarkdownInlineImage part={part} onLinkPress={rendererProps.onLinkPress} />;
  }

  if (part.text.length === 0) {
    return null;
  }

  return <MarkdownFragment text={part.text} {...rendererProps} />;
}

function MarkdownFragment({
  text,
  compact,
  theme,
  rules,
  markdownit,
  onLinkPress,
  allowedImageHandlers,
  topLevelMaxExceededItem,
}: MarkdownRendererProps & { rules: RenderRules }) {
  const style = useMemo(
    () => (compact ? createCompactMarkdownStyles(theme) : createMarkdownStyles(theme)),
    [compact, theme],
  );
  return (
    <MarkdownWithStableRenderer
      style={style}
      rules={rules}
      markdownit={markdownit}
      onLinkPress={onLinkPress}
      allowedImageHandlers={allowedImageHandlers}
      topLevelMaxExceededItem={topLevelMaxExceededItem}
    >
      {text}
    </MarkdownWithStableRenderer>
  );
}

function useNaturalImageDimensions(part: { src: string; width?: number; height?: number }): {
  natural: InlineImageDimensions | null;
  failed: boolean;
  setFailed: (failed: boolean) => void;
} {
  const [natural, setNatural] = useState<InlineImageDimensions | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (part.width && part.height) {
      return;
    }

    let cancelled = false;
    Image.getSize(
      part.src,
      (width, height) => {
        if (!cancelled) {
          setNatural({ width, height });
        }
      },
      () => {
        if (!cancelled) {
          setFailed(true);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [part.height, part.src, part.width]);

  return { natural, failed, setFailed };
}

function MarkdownInlineImage({
  part,
  onLinkPress,
}: {
  part: Extract<MarkdownDisplayPart, { kind: "inlineImage" }>;
  onLinkPress?: (url: string) => boolean;
}) {
  const { natural: naturalDimensions } = useNaturalImageDimensions(part);
  const explicitDimensions = useMemo(
    () => ({ width: part.width, height: part.height }),
    [part.height, part.width],
  );
  const handlePress = useCallback(() => {
    if (!part.href) return;
    if (onLinkPress?.(part.href) === false) return;
    void openExternalUrl(part.href);
  }, [onLinkPress, part.href]);
  const source = useMemo(() => ({ uri: part.src }), [part.src]);
  const imageSize = useMemo(
    () => resolveInlineImageSize({ explicit: explicitDimensions, natural: naturalDimensions }),
    [explicitDimensions, naturalDimensions],
  );
  const imageStyle = useMemo(() => [styles.inlineImage, imageSize], [imageSize]);

  const image = (
    <Image
      source={source}
      style={imageStyle}
      resizeMode="contain"
      accessibilityLabel={part.alt || undefined}
    />
  );

  if (!part.href) {
    return <View style={styles.inlineImageWrap}>{image}</View>;
  }

  return (
    <Pressable style={styles.inlineImageWrap} onPress={handlePress} accessibilityRole="link">
      {image}
    </Pressable>
  );
}

const FLOW_IMAGE_MAX_HEIGHT = 18;

function MarkdownFlowImage({
  part,
  onLinkPress,
  theme,
}: {
  part: MarkdownInlineImagePart;
  onLinkPress?: (url: string) => boolean;
  theme: Theme;
}) {
  const { natural, failed, setFailed } = useNaturalImageDimensions(part);
  const handlePress = useCallback(() => {
    if (!part.href) return;
    if (onLinkPress?.(part.href) === false) return;
    void openExternalUrl(part.href);
  }, [onLinkPress, part.href]);
  const handleError = useCallback(() => setFailed(true), [setFailed]);
  const source = useMemo(() => ({ uri: part.src }), [part.src]);
  const imageSize = useMemo(() => {
    const size = resolveInlineImageSize({
      explicit: { width: part.width, height: part.height },
      natural,
    });
    const scale = Math.min(1, FLOW_IMAGE_MAX_HEIGHT / size.height);
    return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
  }, [natural, part.height, part.width]);
  const imageStyle = useMemo(() => [styles.flowImage, imageSize], [imageSize]);

  if (failed) {
    if (!part.alt) {
      return null;
    }
    return (
      <View style={[styles.flowImageFallback, { backgroundColor: theme.colors.surface2 }]}>
        <Text style={[styles.flowImageFallbackText, { color: theme.colors.foregroundMuted }]}>
          {part.alt}
        </Text>
      </View>
    );
  }

  const image = (
    <Image
      source={source}
      style={imageStyle}
      resizeMode="contain"
      accessibilityLabel={part.alt || undefined}
      onError={handleError}
    />
  );

  if (!part.href) {
    return image;
  }

  return (
    <Pressable onPress={handlePress} accessibilityRole="link">
      {image}
    </Pressable>
  );
}

const MARKDOWN_IMAGE_LOADING_HEIGHT = 160;

// One daemon read per path. Streaming re-renders remount this component, so cache the
// promise rather than the result: a second read of the same screenshot is never needed.
const localImageCache = new Map<string, Promise<string | null>>();

function cachedLocalImage(
  path: string,
  readImage: (input: { path: string }) => Promise<ReadImageResult>,
): Promise<string | null> {
  const cached = localImageCache.get(path);
  if (cached) {
    return cached;
  }
  const pending = readImage({ path }).then(
    (result) => (result.ok ? `data:${result.mime};base64,${result.base64}` : null),
    () => null,
  );
  localImageCache.set(path, pending);
  return pending;
}

// Markdown images: http(s) and data: load directly as before. Absolute paths and
// file:// URLs go through the plugin's daemon process (client/vendor cannot read the
// filesystem) and come back as a data: URI. A failed read shows the alt text muted.
function MarkdownImage({
  src,
  alt,
  imageStyle,
  theme,
}: {
  src: string;
  alt: string;
  imageStyle: ImageStyle;
  theme: Theme;
}) {
  const readImage = useRpc(readImageRpc);
  const localPath = useMemo(() => localFilePath(src.trim()), [src]);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [localFailed, setLocalFailed] = useState(false);

  useEffect(() => {
    if (!localPath) {
      return;
    }
    let cancelled = false;
    setLocalUri(null);
    setLocalFailed(false);
    const load = async () => {
      const uri = await cachedLocalImage(localPath, readImage);
      if (cancelled) {
        return;
      }
      if (uri) {
        setLocalUri(uri);
        return;
      }
      setLocalFailed(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [localPath, readImage]);

  const uri = localPath ? localUri : src;
  const { natural } = useNaturalImageDimensions({ src: uri ?? "" });
  const source = useMemo(() => ({ uri: uri ?? "" }), [uri]);
  const imageSizeStyle = useMemo(
    () =>
      natural
        ? { aspectRatio: natural.width / natural.height }
        : { height: MARKDOWN_IMAGE_LOADING_HEIGHT },
    [natural],
  );
  const resolvedStyle = useMemo(
    () => [imageStyle, styles.markdownImage, imageSizeStyle],
    [imageStyle, imageSizeStyle],
  );
  const [viewerOpen, setViewerOpen] = useState(false);
  const openViewer = useCallback(() => setViewerOpen(true), []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const lightboxSource = useMemo<ImageLightboxSource | null>(
    () => (viewerOpen && uri ? { uri, contentSize: natural ?? undefined } : null),
    [natural, uri, viewerOpen],
  );

  if (!uri) {
    if (!localFailed || !alt) {
      return null;
    }
    return (
      <Text style={[styles.markdownImageAlt, { color: theme.colors.foregroundMuted }]}>{alt}</Text>
    );
  }

  return (
    <>
      <Pressable
        accessibilityLabel={alt || "Open image"}
        accessibilityRole="button"
        onPress={openViewer}
        style={styles.markdownImage}
      >
        <Image
          source={source}
          style={resolvedStyle}
          resizeMode="contain"
          accessibilityLabel={alt || undefined}
        />
      </Pressable>
      <ImageLightbox source={lightboxSource} onClose={closeViewer} theme={theme} />
    </>
  );
}

function MarkdownImageTextGroup({
  group,
  rendererProps,
}: {
  group: Extract<MarkdownPartGroup, { kind: "imageText" }>;
  rendererProps: MarkdownPartRendererProps;
}) {
  return (
    <>
      <View style={styles.imageTextRow}>
        {group.images.map((image) => (
          <MarkdownFlowImage
            key={image.src}
            part={image}
            onLinkPress={rendererProps.onLinkPress}
            theme={rendererProps.theme}
          />
        ))}
        <View style={styles.imageTextRowContent}>
          <MarkdownFragment text={group.lead} {...rendererProps} />
        </View>
      </View>
      {group.rest ? <MarkdownFragment text={group.rest} {...rendererProps} /> : null}
    </>
  );
}

function MarkdownDetails({
  part,
  rendererProps,
}: {
  part: Extract<MarkdownDisplayPart, { kind: "details" }>;
  rendererProps: MarkdownPartRendererProps;
}) {
  const theme = rendererProps.theme;
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  const detailsStyles = useMemo(() => createDetailsStyles(theme), [theme]);
  const bodyParts = useMemo(
    () => part.bodyParts ?? [{ kind: "markdown" as const, text: part.body }],
    [part.body, part.bodyParts],
  );
  return (
    <View style={detailsStyles.container}>
      <Pressable style={detailsStyles.summaryRow} onPress={toggle} accessibilityRole="button">
        {open ? (
          <Icon name="ChevronDown" size={14} color={detailsStyles.summaryIcon.color} />
        ) : (
          <Icon name="ChevronRight" size={14} color={detailsStyles.summaryIcon.color} />
        )}
        <Text style={detailsStyles.summaryText}>{part.summary}</Text>
      </Pressable>
      {open ? (
        <View style={detailsStyles.body}>
          <MarkdownPartList parts={bodyParts} rendererProps={rendererProps} />
        </View>
      ) : null}
    </View>
  );
}

interface MarkdownInheritedTextProps {
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
  style?: TextStyle;
  monoSurface?: boolean;
  copyTag?: MarkdownCopyInlineTag;
  onPress?: TextProps["onPress"];
  accessibilityRole?: TextProps["accessibilityRole"];
  children: ReactNode;
}

export function MarkdownInheritedText({
  inheritedStyles,
  textStyle,
  style: overrideStyle,
  monoSurface,
  copyTag,
  onPress,
  accessibilityRole,
  children,
}: MarkdownInheritedTextProps) {
  const style = useMemo(
    () => [inheritedStyles, textStyle, overrideStyle],
    [inheritedStyles, textStyle, overrideStyle],
  );
  return (
    <MarkdownTextSpan
      monoSurface={monoSurface}
      copyTag={copyTag}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      style={style}
    >
      {children}
    </MarkdownTextSpan>
  );
}

interface MarkdownListItemContentProps {
  contentStyle: ViewStyle;
  children: ReactNode;
}

function MarkdownListItemContent({ contentStyle, children }: MarkdownListItemContentProps) {
  const style = useMemo(() => [contentStyle, MARKDOWN_LIST_ITEM_CONTENT_FLEX], [contentStyle]);
  return <View style={style}>{children}</View>;
}

interface MarkdownListViewProps {
  baseStyle: ViewStyle;
  spacing: { marginTop: number; marginBottom: number };
  children: ReactNode;
}

function MarkdownListView({ baseStyle, spacing, children }: MarkdownListViewProps) {
  const style = useMemo(() => [baseStyle, spacing], [baseStyle, spacing]);
  return <View style={style}>{children}</View>;
}

interface SharedMarkdownLinkProps {
  href: string;
  inheritedStyles: TextStyle;
  linkStyle: TextStyle;
  onLinkPress?: (url: string) => boolean;
  children: ReactNode;
}

function SharedMarkdownLink({
  href,
  inheritedStyles,
  linkStyle,
  onLinkPress,
  children,
}: SharedMarkdownLinkProps) {
  const handlePress = useCallback(() => {
    if (!href) return;
    if (onLinkPress?.(href) === false) return;
    void openExternalUrl(href);
  }, [href, onLinkPress]);
  const style = useMemo(() => [inheritedStyles, linkStyle], [inheritedStyles, linkStyle]);

  if (!isNative) {
    return (
      <MarkdownLinkText style={style} onPress={handlePress}>
        {children}
      </MarkdownLinkText>
    );
  }

  return (
    <MarkdownInheritedText
      inheritedStyles={inheritedStyles}
      textStyle={linkStyle}
      accessibilityRole="link"
      onPress={handlePress}
    >
      {children}
    </MarkdownInheritedText>
  );
}

function getMarkdownLinkHref(node: ASTNode): string {
  const href = node.attributes?.href;
  return typeof href === "string" ? href : "";
}

export function createSharedMarkdownRules(ctx: MarkdownThemeContext): RenderRules {
  return {
    text: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        inheritedStyles={inheritedStyles}
        textStyle={styles.text}
      >
        {node.content}
      </MarkdownInheritedText>
    ),
    textgroup: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        inheritedStyles={inheritedStyles}
        textStyle={styles.textgroup}
      >
        {children}
      </MarkdownInheritedText>
    ),
    strong: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        inheritedStyles={inheritedStyles}
        textStyle={styles.strong}
      >
        {children}
      </MarkdownInheritedText>
    ),
    em: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText key={node.key} inheritedStyles={inheritedStyles} textStyle={styles.em}>
        {children}
      </MarkdownInheritedText>
    ),
    s: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText key={node.key} inheritedStyles={inheritedStyles} textStyle={styles.s}>
        {children}
      </MarkdownInheritedText>
    ),
    hardbreak: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownTextSpan key={node.key} style={styles.hardbreak}>
        {"\n"}
      </MarkdownTextSpan>
    ),
    softbreak: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownTextSpan key={node.key} style={styles.softbreak}>
        {"\n"}
      </MarkdownTextSpan>
    ),
    code_block: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <HighlightedCodeBlock
        key={node.key}
        code={node.content}
        language={null}
        dark={ctx.dark}
        inheritedStyles={inheritedStyles}
        textStyle={styles.code_block}
      />
    ),
    fence: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownFenceBlock
        key={node.key}
        code={node.content}
        info={node.sourceInfo}
        phase="complete"
        dark={ctx.dark}
        theme={ctx.theme}
        inheritedStyles={inheritedStyles}
        textStyle={styles.fence}
      />
    ),
    code_inline: (
      node: ASTNode,
      _children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      inheritedStyles: TextStyle = {},
    ) => (
      <MarkdownInheritedText
        key={node.key}
        inheritedStyles={inheritedStyles}
        textStyle={styles.code_inline}
        monoSurface
      >
        {node.content ?? ""}
      </MarkdownInheritedText>
    ),
    bullet_list: (
      node: ASTNode,
      children: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownListView
        key={node.key}
        baseStyle={styles.bullet_list}
        spacing={getMarkdownListSpacing(node, parent)}
      >
        {children}
      </MarkdownListView>
    ),
    ordered_list: (
      node: ASTNode,
      children: ReactNode[],
      parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownListView
        key={node.key}
        baseStyle={styles.ordered_list}
        spacing={getMarkdownListSpacing(node, parent)}
      >
        {children}
      </MarkdownListView>
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
        <View key={node.key} style={styles.list_item}>
          <Text style={iconStyle}>{marker}</Text>
          <MarkdownListItemContent contentStyle={contentStyle}>{children}</MarkdownListItemContent>
        </View>
      );
    },
    th: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTableCellText key={node.key}>
        <View style={styles._VIEW_SAFE_th}>{children}</View>
      </MarkdownTableCellText>
    ),
    td: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownTableCellText key={node.key}>
        <View style={styles._VIEW_SAFE_td}>{children}</View>
      </MarkdownTableCellText>
    ),
    paragraph: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
    ) => (
      <MarkdownParagraphView
        key={node.key}
        paragraphStyle={styles.paragraph}
        containsImage={markdownNodeContainsType(node, "image")}
      >
        {children}
      </MarkdownParagraphView>
    ),
    link: (
      node: ASTNode,
      children: ReactNode[],
      _parent: ASTNode[],
      styles: MarkdownStyles,
      onLinkPress?: (url: string) => boolean,
    ) => (
      <SharedMarkdownLink
        key={node.key}
        href={getMarkdownLinkHref(node)}
        inheritedStyles={EMPTY_TEXT_STYLE}
        linkStyle={styles.link}
        onLinkPress={onLinkPress}
      >
        {colorMarkdownLinkChildren(children, styles.link.color)}
      </SharedMarkdownLink>
    ),
    image: (node: ASTNode, _children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
      <MarkdownImage
        key={node.key}
        src={typeof node.attributes?.src === "string" ? node.attributes.src : ""}
        alt={typeof node.attributes?.alt === "string" ? node.attributes.alt : ""}
        imageStyle={(styles._VIEW_SAFE_image ?? styles.image) as ImageStyle}
        theme={ctx.theme}
      />
    ),
  };
}

// Static details styles that need no theme colors.
const styles = {
  inlineImageWrap: { alignSelf: "flex-start" as const, marginBottom: 4 },
  inlineImage: {},
  imageTextRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 8,
    marginBottom: 12,
  },
  imageTextRowContent: { flex: 1, minWidth: 0 },
  flowImage: { marginTop: 2 },
  markdownImage: { width: "100%" as const },
  markdownImageAlt: { fontSize: 12, lineHeight: 16 },
  flowImageFallback: {
    marginTop: 2,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  flowImageFallbackText: { fontSize: 10, lineHeight: 14 },
};

function createDetailsStyles(theme: Theme) {
  return {
    container: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      marginBottom: theme.spacing[2],
      overflow: "hidden" as const,
    },
    summaryRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing[1],
      paddingHorizontal: theme.spacing[2],
      paddingVertical: theme.spacing[2],
      backgroundColor: theme.colors.surface2,
    },
    summaryIcon: { color: theme.colors.foregroundMuted },
    summaryText: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.foreground,
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.normal,
      lineHeight: 18,
    },
    body: {
      paddingHorizontal: theme.spacing[2],
      paddingTop: theme.spacing[2],
    },
  };
}
