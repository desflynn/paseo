import type { MarkdownFenceRendererProps } from "../types.ts";
import { isWeb } from "../../../../constants/platform.ts";
import { MermaidFenceHost } from "./host.tsx";
import { MermaidNativeFenceHost } from "./native-host.tsx";

// Web/desktop render the diagram in a sandboxed iframe; native uses the app's
// registered RNCWebView with the same 0.9.2 runtime page.
export function MermaidFence(props: MarkdownFenceRendererProps) {
  return isWeb ? <MermaidFenceHost {...props} /> : <MermaidNativeFenceHost {...props} />;
}
