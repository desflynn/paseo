import type { MarkdownFenceRendererProps } from "../types.ts";
import { isWeb } from "../../../../constants/platform.ts";
import { MermaidFenceHost } from "./host.tsx";
import { MermaidNativeFenceHost } from "./native-host.tsx";
import { HighlightedCodeBlock } from "../../../highlighted-code-block.tsx";

// Bisect flag (2026-09-28): screenshots are blocked on the phone while the plugin runs.
// false = no native WebView; Mermaid shows as code, to test whether the WebView causes it.
const NATIVE_MERMAID_WEBVIEW = true;

// Web/desktop render the diagram in a sandboxed iframe; native uses the app's
// registered RNCWebView with the same 0.9.2 runtime page.
export function MermaidFence(props: MarkdownFenceRendererProps) {
  if (isWeb) return <MermaidFenceHost {...props} />;
  if (!NATIVE_MERMAID_WEBVIEW) {
    return (
      <HighlightedCodeBlock
        code={props.code}
        language="mermaid"
        dark={props.dark ?? true}
        inheritedStyles={props.inheritedStyles}
        textStyle={props.textStyle}
      />
    );
  }
  return <MermaidNativeFenceHost {...props} />;
}
