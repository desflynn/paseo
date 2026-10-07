import { createElement, forwardRef, memo } from "react";
import { codegenNativeCommands, type ViewStyle } from "react-native";

// Props the react-native-webview 13.16 JS wrapper sends to the native view.
export interface NativeWebViewProps {
  newSource: { html: string; baseUrl?: string };
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  messagingEnabled: boolean;
  messagingModuleName: string;
  scrollEnabled: boolean;
  bounces: boolean;
  mediaPlaybackRequiresUserAction?: boolean;
  injectedJavaScript?: string;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onLoadingStart?: (event: { nativeEvent: { url: string } }) => void;
  onLoadingFinish?: (event: { nativeEvent: { url: string } }) => void;
  onLoadingError?: (event: { nativeEvent: { description?: string } }) => void;
  onLayout?: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
  style?: ViewStyle;
}

// ponytail: the app already registered the "RNCWebView" view config; registering it
// again throws, so mount the host component by name and reuse the app's registration.
// memo: on the phone (Android, 0.9.2) any prop update after mount re-sent the source
// empty and reloaded a blank data: page. Callers must pass stable props.
export const NativeWebView = memo(
  forwardRef<unknown, NativeWebViewProps>((props, ref) =>
    createElement("RNCWebView", { ...props, ref }),
  ),
);

interface WebViewCommands {
  injectJavaScript(viewRef: never, script: string): void;
}

let webViewCommands: WebViewCommands | undefined;

export function getWebViewCommands(): WebViewCommands {
  return (webViewCommands ??= codegenNativeCommands<WebViewCommands>({
    supportedCommands: ["injectJavaScript"],
  }));
}
