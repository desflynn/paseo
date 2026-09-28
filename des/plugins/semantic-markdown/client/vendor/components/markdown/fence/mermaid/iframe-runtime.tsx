import { useCallback, useEffect, useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { isWeb } from "../../../../constants/platform.ts";
import type { DiagramColorScheme, MermaidRenderRequest } from "./render-model.ts";
import { mermaidRuntimeHtml } from "./runtime/html.gen.ts";
import {
  parseMermaidRuntimeMessage,
  type MermaidRuntimeRenderMessage,
} from "./runtime/messages.ts";
import { MermaidRuntimeRequestDriver } from "./runtime/request-driver.ts";

export interface MermaidRenderedMessage {
  revision: number;
  source: string;
  colorScheme: DiagramColorScheme;
  height: number;
  width: number;
}

interface MermaidIframeRuntimeProps {
  request: MermaidRenderRequest | null;
  onRendered: (message: MermaidRenderedMessage) => void;
  onRenderFailed: (revision: number) => void;
  style?: ViewStyle;
}

/**
 * Sandboxed Mermaid renderer. Sizing and gestures belong to the surrounding
 * host. The iframe is created imperatively: the plugin compiler is
 * platform-neutral, so JSX must stay RN-only and DOM access stays behind the
 * isWeb gate (web + Electron only).
 */
export function MermaidIframeRuntime({
  request,
  onRendered,
  onRenderFailed,
  style,
}: MermaidIframeRuntimeProps) {
  const containerRef = useRef<View | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const driverRef = useRef<MermaidRuntimeRequestDriver | null>(null);
  driverRef.current ??= new MermaidRuntimeRequestDriver();

  const sendRequest = useCallback((current: MermaidRenderRequest | null) => {
    const target = iframeRef.current?.contentWindow;
    if (!current || !target) return;
    const message: MermaidRuntimeRenderMessage = {
      type: "render",
      revision: current.revision,
      source: current.source,
      colorScheme: current.colorScheme,
      interactive: false,
    };
    target.postMessage(message, "*");
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    const container = containerRef.current as unknown as HTMLElement | null;
    if (!container) return;

    const iframe = document.createElement("iframe");
    iframe.title = "";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.tabIndex = -1;
    iframe.srcdoc = mermaidRuntimeHtml;
    Object.assign(iframe.style, iframeCss);
    // `inert` (not just tabIndex): a focused iframe swallows every keystroke,
    // including Escape in modals.
    iframe.inert = true;
    container.appendChild(iframe);
    iframeRef.current = iframe;

    return () => {
      iframeRef.current = null;
      iframe.remove();
    };
  }, []);

  useEffect(() => {
    sendRequest(driverRef.current?.update(request) ?? null);
  }, [request, sendRequest]);

  useEffect(() => {
    function receiveMessage(event: MessageEvent): void {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const message = parseMermaidRuntimeMessage(event.data);
      if (!message) return;
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
    }
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [onRenderFailed, onRendered, sendRequest]);

  return <View ref={containerRef} style={style} collapsable={false} />;
}

const iframeCss = {
  display: "block",
  width: "100%",
  height: "100%",
  border: "0",
  pointerEvents: "none",
  background: "transparent",
};
