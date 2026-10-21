import { createElement, forwardRef } from "react";
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
  injectedJavaScript?: string;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onLoadingStart?: (event: { nativeEvent: { url: string } }) => void;
  onLoadingFinish?: (event: { nativeEvent: { url: string } }) => void;
  onLoadingError?: (event: { nativeEvent: { description?: string } }) => void;
  style?: ViewStyle;
}

// ponytail: the app already registered the "RNCWebView" view config; registering it
// again throws, so mount the host component by name and reuse the app's registration.
export const NativeWebView = forwardRef<unknown, NativeWebViewProps>((props, ref) =>
  createElement("RNCWebView", { ...props, ref }),
);

export const WebViewCommands = codegenNativeCommands<{
  injectJavaScript(viewRef: never, script: string): void;
}>({ supportedCommands: ["injectJavaScript"] });
