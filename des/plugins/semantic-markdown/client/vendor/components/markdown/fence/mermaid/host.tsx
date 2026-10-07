import { useCallback, useMemo, useState } from "react";
import { Pressable, View, type TextStyle, type ViewStyle } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { MarkdownFenceRendererProps } from "../types.ts";
import { HighlightedCodeBlock } from "../../../highlighted-code-block.tsx";
import { MermaidIframeRuntime, type MermaidRenderedMessage } from "./iframe-runtime.tsx";
import { useMermaidRenderModel } from "./use-render-model.ts";
import { getDiagramBoxStyle } from "./presentation.ts";

interface MermaidFenceHostProps extends MarkdownFenceRendererProps {
  colorScheme?: "light" | "dark";
}

// Adapted from the app's host.web.tsx: no zoom viewport, no fullscreen viewer
// (VENDOR_PLAN risk 6 defers both), no i18n — the diagram box sizes itself to
// the rendered dimensions.
export function MermaidFenceHost({
  code,
  phase,
  dark = true,
  colorScheme,
  inheritedStyles,
  textStyle,
}: MermaidFenceHostProps) {
  const scheme = colorScheme ?? (dark ? "dark" : "light");
  const { state, request, rendered, renderFailed } = useMermaidRenderModel({
    source: code,
    phase,
    colorScheme: scheme,
  });
  const [hasRuntimeContent, setHasRuntimeContent] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const showSourcePress = useCallback(() => setShowSource(true), []);
  const showDiagramPress = useCallback(() => setShowSource(false), []);
  const handleRendered = useCallback(
    (message: MermaidRenderedMessage) => {
      setHasRuntimeContent(true);
      rendered({
        revision: message.revision,
        source: message.source,
        colorScheme: message.colorScheme,
        dimensions: { height: message.height, width: message.width },
      });
    },
    [rendered],
  );

  const visible = state.visible;
  const canShowDiagram = visible !== null && hasRuntimeContent;
  const diagramVisible = canShowDiagram && !showSource;
  const runtimeHeight = Math.max(visible?.height ?? FALLBACK_HEIGHT, MIN_BOX_HEIGHT);

  const sourceView = useMemo(() => {
    const { marginTop, marginBottom, marginVertical, ...sourceTextStyle } = textStyle;
    const margins: ViewStyle = {
      marginTop: marginTop ?? marginVertical,
      marginBottom: marginBottom ?? marginVertical,
    };
    return { container: [margins, sourceContainerStyle], text: sourceTextStyle as TextStyle };
  }, [textStyle]);

  const diagramStyle = useMemo(
    () => [
      getDiagramBoxStyle(textStyle),
      containerStyle,
      { height: runtimeHeight, minHeight: MIN_BOX_HEIGHT },
    ],
    [runtimeHeight, textStyle],
  );

  return (
    <>
      {showSource || !diagramVisible ? (
        <View style={sourceView.container}>
          <HighlightedCodeBlock
            code={code}
            language="mermaid"
            dark={dark}
            inheritedStyles={inheritedStyles}
            textStyle={sourceView.text}
          />
          {showSource && canShowDiagram ? (
            <Pressable
              accessibilityLabel="View diagram"
              accessibilityRole="button"
              hitSlop={4}
              onPress={showDiagramPress}
              style={controlStyles.sourceButton}
            >
              <Icon name="Workflow" size={14} color={controlStyles.icon.color} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {diagramVisible ? (
        <View style={diagramStyle}>
          <MermaidIframeRuntime
            request={request}
            onRendered={handleRendered}
            onRenderFailed={renderFailed}
            style={runtimeFill}
          />
          <Pressable
            accessibilityLabel="View diagram source"
            accessibilityRole="button"
            hitSlop={4}
            onPress={showSourcePress}
            style={controlStyles.sourceButton}
          >
            <Icon name="Code" size={14} color={controlStyles.icon.color} />
          </Pressable>
        </View>
      ) : (
        // Measuring pass: the iframe loads and reports dimensions while the
        // source block is still shown; no invisible full-width spacer.
        <View style={measuringStyle as ViewStyle} pointerEvents="none">
          <MermaidIframeRuntime
            request={request}
            onRendered={handleRendered}
            onRenderFailed={renderFailed}
            style={runtimeFill}
          />
        </View>
      )}
    </>
  );
}

const FALLBACK_HEIGHT = 240;
/**
 * The toolbar overlays the top of the box (8px offset + 32px compact buttons) and the box clips
 * with `overflow: hidden`, so a shorter box leaves the buttons half-clipped and unclickable.
 */
const MIN_BOX_HEIGHT = 56;
const sourceContainerStyle = { position: "relative" as const };
/**
 * The viewport's own root is `flex: 1`, so as a flex item it has `flex-basis: 0%` and that basis
 * replaces the height below. In the markdown column there is no free space to grow into, so the
 * box collapses and the diagram is scaled down to fit a couple of pixels. Size it from the height.
 */
const containerStyle: ViewStyle = {
  flexBasis: "auto",
  flexGrow: 0,
  flexShrink: 0,
  overflow: "hidden",
  position: "relative",
  borderRadius: 6,
};
const runtimeFill: ViewStyle = { width: "100%", height: "100%" };
const measuringStyle = {
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  height: FALLBACK_HEIGHT,
  opacity: 0,
};
const controlStyles = {
  sourceButton: { position: "absolute" as const, top: 8, right: 8, padding: 4 },
  icon: { color: "#a1a1aa" },
};
