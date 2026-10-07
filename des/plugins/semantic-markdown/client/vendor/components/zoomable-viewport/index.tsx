// Platform dispatch, mirroring the vendored Mermaid fence: plugin bundles get no
// Metro .web resolution, so the switch is a runtime Platform.OS check.
import { isWeb } from "../../constants/platform.ts";
import { ZoomableViewportNative } from "./native.tsx";
import type { ZoomableViewportProps } from "./types.ts";
import { ZoomableViewportWeb } from "./web.tsx";

export function ZoomableViewport(props: ZoomableViewportProps) {
  if (isWeb) {
    return <ZoomableViewportWeb {...props} />;
  }
  return <ZoomableViewportNative {...props} />;
}
