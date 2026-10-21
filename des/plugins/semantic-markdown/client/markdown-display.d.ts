// Types for the esbuild prebundle of patched react-native-markdown-display
// (client/markdown-display.js). ASTNode is declared here because the package's
// own types predate the patch: `sourceMeta` (deterministic keys + token meta)
// and `sourceInfo` (fence info strings) exist only at runtime after patching.
import type MarkdownIt from "../shared/markdown-it.js";

// These `any` fields mirror react-native-markdown-display's published AST/render-rule
// types (plus the patch's sourceMeta): narrowing them would break drop-in compatibility.
// oxlint-disable typescript-eslint/no-explicit-any

export interface ASTNode {
  type: string;
  sourceType: string;
  key: string;
  content: string;
  markup: string;
  tokenIndex: number;
  index: number;
  attributes: Record<string, any>;
  children: ASTNode[];
  sourceMeta?: any;
  sourceInfo?: string;
}

export type RenderRules = Record<
  string,
  (
    node: ASTNode,
    children: any[],
    parent: ASTNode[],
    style?: any,
    inheritedStyle?: any,
    onLinkPress?: (url: string) => boolean,
  ) => any
>;

interface MarkdownProps {
  markdownit?: MarkdownIt;
  rules?: RenderRules;
  style?: Record<string, object>;
  onLinkPress?: (url: string) => boolean;
  allowedImageHandlers?: readonly string[];
  topLevelMaxExceededItem?: unknown;
}

declare function Markdown(
  props: MarkdownProps & { children?: React.ReactNode },
): React.ReactElement | null;
export default Markdown;
export { MarkdownIt };
