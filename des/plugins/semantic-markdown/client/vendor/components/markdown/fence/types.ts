import type { TextStyle } from "react-native";
import type { Theme } from "../../../styles/theme.ts";

export type MarkdownPhase = "streaming" | "complete";

export interface MarkdownFenceRendererProps {
  code: string;
  phase: MarkdownPhase;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
  /** Plugin seams replacing the app's unistyles theme access. */
  dark?: boolean;
  theme?: Theme;
}
