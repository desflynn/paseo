import { useCallback, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { mermaidRuntimeHtml } from "./mermaid-html.gen.ts";
import { NativeWebView, WebViewCommands } from "./native-webview.tsx";

const SAMPLE_MERMAID = `flowchart LR
  A[Plugin] --> B{WebView}
  B -->|ok| C[Diagram]
  B -->|fail| D[Source]`;

const MAX_PREVIEW_HEIGHT = 480;
const IS_ANDROID = Platform.OS === "android";

// Android delivers WebView messages to the app's own RNCWebViewMessagingModule,
// which a plugin cannot listen to without replacing it. Instead, give the page a
// ReactNativeWebView.postMessage that writes each message into the URL hash; the
// resulting history update reaches us as a direct onLoadingStart event.
const HASH_PREFIX = "#paseo-plugin-msg=";
const ANDROID_BRIDGE = `(function(){
  window.ReactNativeWebView = { postMessage: function (data) {
    var hash = "${HASH_PREFIX}" + encodeURIComponent(data);
    try { history.pushState(null, "", hash); } catch (e) { location.hash = hash; }
  } };
})(); true;`;

// Constant like the app's WEBVIEW_SOURCE: a new object on each render makes the native
// view reload the page. Android loads html with an empty or about: base as a data: URL,
// where a hash change also reloads; an https base makes it a same-document history
// update. Nothing is fetched because the html is passed in directly.
const WEBVIEW_SOURCE = IS_ANDROID
  ? { html: mermaidRuntimeHtml, baseUrl: "https://paseo-plugin.invalid/" }
  : { html: mermaidRuntimeHtml };
const ORIGIN_WHITELIST = ["*"];

export function MermaidPart({ scheme, muted }: { scheme: "light" | "dark"; muted: object }) {
  const webViewRef = useRef<unknown>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const log = useCallback((line: string) => setEvents((prev) => [...prev.slice(-7), line]), []);

  const sendRender = useCallback(() => {
    const payload = JSON.stringify({
      type: "render",
      revision: 1,
      source: SAMPLE_MERMAID,
      colorScheme: scheme,
      interactive: false,
    }).replace(/<\/script/gi, "<\\/script");
    try {
      WebViewCommands.injectJavaScript(
        webViewRef.current as never,
        `window.__PASEO_MERMAID_RUNTIME_RECEIVE__ && window.__PASEO_MERMAID_RUNTIME_RECEIVE__(${payload}); true;`,
      );
      log("sent render");
    } catch (e) {
      log(`injectJavaScript failed: ${String(e)}`);
    }
  }, [scheme, log]);

  const handleData = useCallback(
    (data: string) => {
      let msg: { type?: string; height?: number };
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      log(`message: ${msg.type}`);
      if (msg.type === "bridgeReady") sendRender();
      else if (msg.type === "rendered" && typeof msg.height === "number") setHeight(msg.height);
    },
    [log, sendRender],
  );

  const onLoadingStart = useCallback(
    (event: { nativeEvent: { url: string } }) => {
      const url = event.nativeEvent.url ?? "";
      const at = url.indexOf(HASH_PREFIX);
      if (at >= 0) handleData(decodeURIComponent(url.slice(at + HASH_PREFIX.length)));
      else log(`loadingStart ${url.slice(0, 40)}`);
    },
    [handleData, log],
  );

  return (
    <View style={{ gap: 8 }}>
      <Text selectable style={muted}>
        mermaid ({Platform.OS}): {height ? `rendered, height ${Math.round(height)}` : "not rendered"}
        {"\n"}
        {events.join("\n")}
      </Text>
      <View style={{ height: height ? Math.min(height, MAX_PREVIEW_HEIGHT) : 240 }}>
        <NativeWebView
          ref={webViewRef}
          newSource={WEBVIEW_SOURCE}
          originWhitelist={ORIGIN_WHITELIST}
          javaScriptEnabled
          messagingEnabled={!IS_ANDROID}
          messagingModuleName=""
          injectedJavaScript={IS_ANDROID ? ANDROID_BRIDGE : undefined}
          scrollEnabled={false}
          bounces={false}
          onMessage={(event) => handleData(event.nativeEvent.data)}
          onLoadingStart={onLoadingStart}
          onLoadingFinish={(event) => {
            log(`loadingFinish ${String(event.nativeEvent.url).slice(0, 40)}`);
            // The bridge shim may install after the page's own bridgeReady, so ask directly.
            if (IS_ANDROID) sendRender();
          }}
          onLoadingError={(event) => log(`loadingError ${event.nativeEvent.description ?? ""}`)}
          style={{ flex: 1, backgroundColor: "transparent" }}
        />
      </View>
    </View>
  );
}
