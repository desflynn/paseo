// Port of packages/app/src/components/zoomable-viewport/types.ts at v0.9.2.
// The app's unistyles theme is replaced by a theme prop; the app's toolbar `actions`
// are not vendored (the lightbox owns its close button).
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { Theme } from "../../styles/theme.ts";
import type { ViewportFitOptions, ViewportSize } from "./geometry.ts";

export interface ZoomableViewportProps {
  contentSize: ViewportSize;
  children: ReactNode;
  accessibilityLabel?: string;
  fit?: ViewportFitOptions;
  maxScale?: number;
  minScale?: number;
  onPressOutsideContent?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  theme: Theme;
  /** Web only: shifts the toolbar cluster left, to clear the lightbox close button. */
  toolbarInsetRight?: number;
  wheelActivation?: "always" | "modifier";
}
