import { useMemo, type ReactNode } from "react";
import {
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { CODE_SURFACE_DATASET } from "../styles/code-surface.ts";
import {
  markdownCopyDataSet,
  type MarkdownCopyInlineTag,
} from "../assistant-selection-copy/markup.ts";
import { isWeb } from "../constants/platform.ts";

interface MarkdownTextSpanProps {
  style?: StyleProp<TextStyle>;
  monoSurface?: boolean;
  copyTag?: MarkdownCopyInlineTag;
  children: ReactNode;
  onPress?: TextProps["onPress"];
  accessibilityRole?: TextProps["accessibilityRole"];
}

// Single-file collapse of the app's markdown-text.{web,android,ios}.tsx — the
// plugin compiler is platform-neutral, so platform behavior branches at
// runtime. iOS runs the Android path (per-line <Text selectable> selection;
// no UITextView cross-span drag) because react-native-uitextview is not a
// documented plugin-bundle export (VENDOR_PLAN risk 1). Web keeps the
// data-paseo-* copy attributes the app's selection manager consumes.
export function MarkdownTextSpan({
  style,
  monoSurface,
  copyTag,
  children,
  onPress,
  accessibilityRole,
}: MarkdownTextSpanProps) {
  const dataSet = useMemo(() => {
    if (!isWeb) return undefined;
    if (copyTag && (monoSurface || copyTag === "code")) {
      return { ...CODE_SURFACE_DATASET, ...markdownCopyDataSet[copyTag] };
    }
    if (copyTag) return markdownCopyDataSet[copyTag];
    return monoSurface ? CODE_SURFACE_DATASET : undefined;
  }, [copyTag, monoSurface]);

  return (
    <Text
      // react-native-web maps selectable={false} to user-select:none applied
      // AFTER style, which would defeat the markdown styles' userSelect:text
      // and clamp drag selection per span. Web must omit the prop; native keeps
      // per-line <Text selectable>.
      selectable={isWeb ? undefined : true}
      dataSet={dataSet}
      style={style}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Text>
  );
}

interface MarkdownParagraphViewProps {
  paragraphStyle: ViewStyle;
  containsImage?: boolean;
  children: ReactNode;
}

const MARKDOWN_PARAGRAPH_RESET: ViewStyle = {};

// Paragraph is a View on every platform in the app's web/android variants (and
// in the iOS variant whenever the paragraph contains an image) so block-level
// children keep their natural layout.
export function MarkdownParagraphView({
  paragraphStyle,
  containsImage: _containsImage = false,
  children,
}: MarkdownParagraphViewProps) {
  const style = useMemo(() => [paragraphStyle, MARKDOWN_PARAGRAPH_RESET], [paragraphStyle]);
  const dataSet = isWeb ? markdownCopyDataSet.p : undefined;
  return (
    <View style={style} dataSet={dataSet}>
      {children}
    </View>
  );
}
