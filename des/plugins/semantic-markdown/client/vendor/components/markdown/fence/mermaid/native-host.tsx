// Port of 0.9.2 packages/app/src/components/markdown/fence/mermaid/host.native.tsx.
// Differences: the plugin mounts the app's registered native RNCWebView directly
// (no react-native-webview import), Android replies travel through the URL hash, and
// theme, icons and labels come from plugin props instead of unistyles/lucide/i18n.
// Inline style arrays/objects and handlers are deliberate render-time allocations
// (same rationale as the app's react-perf override for this viewer).
// oxlint-disable react-perf/jsx-no-new-array-as-prop, react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { HighlightedCodeBlock } from "../../../highlighted-code-block.tsx";
import type { MarkdownFenceRendererProps } from "../types.ts";
import type { MermaidRenderRequest } from "./render-model.ts";
import { mermaidRuntimeHtml } from "./runtime/html.gen.ts";
import {
  parseMermaidRuntimeMessage,
  serializeMermaidRuntimeRenderMessage,
  type MermaidRuntimeRenderMessage,
} from "./runtime/messages.ts";
import { MermaidRuntimeRequestDriver } from "./runtime/request-driver.ts";
import { useMermaidRenderModel } from "./use-render-model.ts";
import { getDiagramBoxStyle } from "./presentation.ts";
import { getWebViewCommands, NativeWebView } from "./native-webview.tsx";

const IS_ANDROID = Platform.OS === "android";
const MAX_PREVIEW_HEIGHT = 480;
const VIEWER_TOP_INSET = 48;
// Debug flag: true shows the WebView event trail under each diagram (load, send, reply,
// sizes). Off by default; turn on when Mermaid misbehaves on a device.
const MERMAID_DEBUG = false;

// Android delivers WebView messages to the app's own RNCWebViewMessagingModule, which a
// plugin cannot listen to without replacing it. Give the page a postMessage that opens a
// window: the app's WebView turns that into a direct onOpenWindow event carrying the URL,
// and the page does not navigate. (The earlier URL-hash channel broke: on the phone the
// page loaded as a data: URL, where every hash change reloads the page.)
const MESSAGE_URL = "https://paseo-plugin.invalid/msg#";
const ANDROID_BRIDGE = `(function(){
  window.ReactNativeWebView = { postMessage: function (data) {
    window.open("${MESSAGE_URL}" + encodeURIComponent(data));
  } };
})(); true;`;

// Constant like the app's WEBVIEW_SOURCE: a new object per render reloads the page.
// Nothing is fetched from the base.
const WEBVIEW_SOURCE = IS_ANDROID
  ? { html: mermaidRuntimeHtml, baseUrl: "https://paseo-plugin.invalid/" }
  : { html: mermaidRuntimeHtml };
const ORIGIN_WHITELIST = ["*"];

interface RenderedMessage {
  revision: number;
  source: string;
  colorScheme: "light" | "dark";
  height: number;
  width: number;
}

interface MermaidWebViewProps {
  request: MermaidRenderRequest | null;
  interactive: boolean;
  onRendered: (message: RenderedMessage) => void;
  onRenderFailed: (revision: number) => void;
  style?: ViewStyle;
  /** Debug until stable: event trail shown under the fence. */
  log?: (line: string) => void;
}

function MermaidWebView({
  request,
  interactive,
  onRendered,
  onRenderFailed,
  style,
  log,
}: MermaidWebViewProps) {
  const webViewRef = useRef<unknown>(null);
  const driverRef = useRef<MermaidRuntimeRequestDriver | null>(null);
  driverRef.current ??= new MermaidRuntimeRequestDriver();
  const sendCountRef = useRef(0);
  const requestRef = useRef(request);
  requestRef.current = request;

  const sendRequest = useCallback(
    (current: MermaidRenderRequest | null) => {
      // Debug: log only a real skip. "No request" fires on every render (the hook
      // returns a fresh request object), and logging it looped the render.
      if (!current) return;
      if (!webViewRef.current) {
        log?.("send skipped: no webview ref");
        return;
      }
      // Debug guard: on a data: page every reply reloads the page, and each reload
      // resends. Cap sends per view so that cannot loop.
      sendCountRef.current += 1;
      if (sendCountRef.current > 3) {
        if (sendCountRef.current === 4) log?.("send cap reached, stopped");
        return;
      }
      log?.(`send render r${current.revision}`);
      const message: MermaidRuntimeRenderMessage = {
        type: "render",
        revision: current.revision,
        source: current.source,
        colorScheme: current.colorScheme,
        interactive,
      };
      const payload = serializeMermaidRuntimeRenderMessage(message);
      try {
        getWebViewCommands().injectJavaScript(
          webViewRef.current as never,
          `window.__PASEO_MERMAID_RUNTIME_RECEIVE__ && window.__PASEO_MERMAID_RUNTIME_RECEIVE__(${payload}); true;`,
        );
      } catch (error) {
        log?.(`injectJavaScript threw: ${String(error)}`);
      }
    },
    [interactive, log],
  );

  useEffect(() => {
    sendRequest(driverRef.current?.update(request) ?? null);
  }, [request, sendRequest]);

  const handleData = useCallback(
    (data: string) => {
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        return;
      }
      const message = parseMermaidRuntimeMessage(value);
      if (!message) {
        log?.(`unparsed reply: ${data.slice(0, 80)}`);
        return;
      }
      log?.(`reply ${message.type}${"revision" in message ? ` r${message.revision}` : ""}`);
      if (message.type === "bridgeReady") {
        sendRequest(driverRef.current?.ready() ?? null);
        return;
      }
      if (message.type === "renderError") {
        onRenderFailed(message.revision);
        sendRequest(driverRef.current?.settled(message.revision, false) ?? null);
        return;
      }
      onRendered(message);
      sendRequest(driverRef.current?.settled(message.revision, true) ?? null);
    },
    [onRenderFailed, onRendered, sendRequest, log],
  );

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => handleData(event.nativeEvent.data),
    [handleData],
  );
  const onLoadingStart = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      const url = event.nativeEvent.url ?? "";
      log?.(`loadingStart ${url.slice(0, 30)} len=${url.length}`);
      // A fresh page has nothing in flight: restart the driver with the current request,
      // so the page's loadingFinish sends it. Otherwise a send to the page being
      // replaced leaves the request marked in flight and the new page gets nothing.
      driverRef.current = new MermaidRuntimeRequestDriver();
      driverRef.current.update(requestRef.current);
    },
    [log],
  );
  const onOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl: string } }) => {
      const url = event.nativeEvent.targetUrl ?? "";
      if (!url.startsWith(MESSAGE_URL)) {
        log?.(`openWindow ignored ${url.slice(0, 40)}`);
        return;
      }
      handleData(decodeURIComponent(url.slice(MESSAGE_URL.length)));
    },
    [handleData, log],
  );
  // The Android shim installs at page finish, after the page's own bridgeReady, so
  // announce readiness ourselves.
  const onLoadingFinish = useCallback(() => {
    log?.("loadingFinish");
    if (IS_ANDROID) sendRequest(driverRef.current?.ready() ?? null);
  }, [sendRequest, log]);

  // Every prop to the memoised NativeWebView stays stable after mount (see native-webview.tsx):
  // handlers go through a ref, the style is memoised.
  const handlersRef = useRef({ onMessage, onLoadingStart, onLoadingFinish, onOpenWindow, log });
  handlersRef.current = { onMessage, onLoadingStart, onLoadingFinish, onOpenWindow, log };
  const stableHandlers = useMemo(
    () => ({
      onMessage: (event: { nativeEvent: { data: string } }) => handlersRef.current.onMessage(event),
      onLoadingStart: (event: { nativeEvent: { url: string } }) =>
        handlersRef.current.onLoadingStart(event),
      onLoadingFinish: () => handlersRef.current.onLoadingFinish(),
      onLayout: (event: { nativeEvent: { layout: { width: number; height: number } } }) =>
        handlersRef.current.log?.(
          `webview ${Math.round(event.nativeEvent.layout.width)}x${Math.round(event.nativeEvent.layout.height)}`,
        ),
      onOpenWindow: (event: { nativeEvent: { targetUrl: string } }) =>
        handlersRef.current.onOpenWindow(event),
      onLoadingError: (event: { nativeEvent: { description?: string } }) =>
        handlersRef.current.log?.(`loadingError ${event.nativeEvent.description ?? ""}`),
    }),
    [],
  );
  const webViewStyle = useMemo(() => StyleSheet.flatten([webViewStyles.webView, style]), [style]);

  return (
    <NativeWebView
      ref={webViewRef}
      newSource={WEBVIEW_SOURCE}
      originWhitelist={ORIGIN_WHITELIST}
      javaScriptEnabled
      messagingEnabled={!IS_ANDROID}
      messagingModuleName=""
      injectedJavaScript={IS_ANDROID ? ANDROID_BRIDGE : undefined}
      hasOnOpenWindowEvent={IS_ANDROID}
      javaScriptCanOpenWindowsAutomatically={IS_ANDROID}
      scrollEnabled={interactive}
      bounces={false}
      {...stableHandlers}
      style={webViewStyle}
    />
  );
}

const webViewStyles = StyleSheet.create({
  // flex: 1 — react-native-webview's JS wrapper adds this; we mount the raw native
  // view, so without it the preview WebView had no height inside its sized box.
  webView: { flex: 1, backgroundColor: "transparent" },
});

interface ViewerProps {
  code: string;
  colorScheme: "light" | "dark";
  onClose: () => void;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
  props: MarkdownFenceRendererProps;
}

function MermaidDiagramViewer({
  code,
  colorScheme,
  onClose,
  inheritedStyles,
  textStyle,
  props,
}: ViewerProps) {
  const [showSource, setShowSource] = useState(false);
  const toggleSource = useCallback(() => setShowSource((current) => !current), []);
  const { request, rendered, renderFailed } = useMermaidRenderModel({
    source: code,
    phase: "complete",
    colorScheme,
  });
  const handleRendered = useCallback(
    (message: RenderedMessage) =>
      rendered({
        revision: message.revision,
        source: message.source,
        colorScheme: message.colorScheme,
        dimensions: { height: message.height, width: message.width },
      }),
    [rendered],
  );
  const colors = props.theme?.colors;
  const surface0 = colors?.surface0 ?? "#000";
  const surface2 = colors?.surface2 ?? "#333";
  const foreground = colors?.foreground ?? "#fff";

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <View style={[viewerStyles.backdrop, { backgroundColor: surface0 }]}>
        <View style={viewerStyles.webView}>
          <MermaidWebView
            request={request}
            interactive
            onRendered={handleRendered}
            onRenderFailed={renderFailed}
            style={viewerStyles.runtime}
          />
          {showSource ? (
            <ScrollView
              style={[viewerStyles.sourceOverlay, { backgroundColor: surface0 }]}
              contentContainerStyle={viewerStyles.source}
            >
              <HighlightedCodeBlock
                code={code}
                language="mermaid"
                dark={props.dark}
                inheritedStyles={inheritedStyles}
                textStyle={textStyle}
              />
            </ScrollView>
          ) : null}
        </View>
        <View style={viewerStyles.actions}>
          <Pressable
            onPress={toggleSource}
            style={[viewerStyles.actionButton, { backgroundColor: surface2 }]}
            accessibilityRole="button"
            accessibilityLabel={showSource ? "View diagram" : "View source"}
            hitSlop={12}
          >
            <Icon name={showSource ? "Workflow" : "Code"} size={20} color={foreground} />
          </Pressable>
          <Pressable
            onPress={onClose}
            style={[viewerStyles.actionButton, { backgroundColor: surface2 }]}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Icon name="X" size={20} color={foreground} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const viewerStyles = StyleSheet.create({
  backdrop: { flex: 1 },
  webView: { flex: 1, marginTop: VIEWER_TOP_INSET, marginBottom: 16 },
  runtime: { flex: 1 },
  sourceOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  source: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 16 },
  actions: {
    position: "absolute",
    top: VIEWER_TOP_INSET + 12,
    right: 16,
    flexDirection: "row",
    gap: 8,
  },
  actionButton: { padding: 8, borderRadius: 8 },
});

export function MermaidNativeFenceHost(props: MarkdownFenceRendererProps) {
  const { code, phase, inheritedStyles, textStyle, dark = true } = props;
  const colorScheme = dark ? "dark" : "light";
  const { state, request, rendered, renderFailed } = useMermaidRenderModel({
    source: code,
    phase,
    colorScheme,
  });
  const [hasRuntimeContent, setHasRuntimeContent] = useState(false);
  // Debug until stable: last events from the preview WebView.
  const [events, setEvents] = useState<string[]>([]);
  const log = useCallback((line: string) => {
    if (MERMAID_DEBUG) setEvents((current) => [...current.slice(-11), line]);
  }, []);
  const handleRendered = useCallback(
    (message: RenderedMessage) => {
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
  const [viewerOpen, setViewerOpen] = useState(false);
  const openViewer = useCallback(() => setViewerOpen(true), []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const visible = state.visible;
  const canShowDiagram = visible !== null && hasRuntimeContent;
  const previewInnerStyle = useMemo(
    () =>
      canShowDiagram && visible
        ? { height: Math.min(visible.height, MAX_PREVIEW_HEIGHT) }
        : previewStyles.measuringInner,
    [canShowDiagram, visible],
  );
  const diagramBoxStyle = getDiagramBoxStyle(textStyle);

  return (
    <>
      {!canShowDiagram ? (
        <HighlightedCodeBlock
          code={code}
          language="mermaid"
          dark={dark}
          inheritedStyles={inheritedStyles}
          textStyle={textStyle}
        />
      ) : null}
      <Pressable
        onPress={openViewer}
        disabled={!canShowDiagram}
        accessibilityRole={canShowDiagram ? "imagebutton" : undefined}
        accessibilityLabel="Diagram"
        style={
          canShowDiagram
            ? [diagramBoxStyle, previewStyles.preview]
            : [diagramBoxStyle, previewStyles.measuring]
        }
      >
        <View
          style={previewInnerStyle}
          pointerEvents="none"
          onLayout={(event) => log(`box h=${Math.round(event.nativeEvent.layout.height)}`)}
        >
          <MermaidWebView
            request={request}
            interactive={false}
            onRendered={handleRendered}
            onRenderFailed={renderFailed}
            log={log}
          />
        </View>
      </Pressable>
      {viewerOpen && canShowDiagram && visible ? (
        <MermaidDiagramViewer
          code={visible.source}
          colorScheme={visible.colorScheme}
          onClose={closeViewer}
          inheritedStyles={inheritedStyles}
          textStyle={textStyle}
          props={props}
        />
      ) : null}
      {MERMAID_DEBUG ? (
        <Text
          selectable
          style={{ color: props.theme?.colors?.foregroundMuted ?? "#888", fontSize: 11 }}
        >
          {`mermaid ${Platform.OS}: status ${String((state as { status?: unknown }).status)}, shown ${String(canShowDiagram)}\n${events.join("\n")}`}
        </Text>
      ) : null}
    </>
  );
}

const previewStyles = StyleSheet.create({
  measuring: { position: "absolute", left: 0, right: 0, opacity: 0, pointerEvents: "none" },
  measuringInner: { height: 240 },
  preview: { overflow: "hidden" },
});
