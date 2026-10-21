import type { ComponentType } from "react";
import { HighlightedCodeBlock } from "../../highlighted-code-block.tsx";
import { getMarkdownFenceLanguage } from "./language.ts";
import { MermaidFence } from "./mermaid/index.tsx";
import type { MarkdownFenceRendererProps } from "./types.ts";

export interface MarkdownFenceBlockProps extends MarkdownFenceRendererProps {
  info: string | null | undefined;
}

const diagramFences: Partial<Record<string, ComponentType<MarkdownFenceRendererProps>>> = {
  mermaid: MermaidFence,
};

export function MarkdownFenceBlock({
  code,
  info,
  phase,
  dark,
  theme,
  inheritedStyles,
  textStyle,
}: MarkdownFenceBlockProps) {
  const language = getMarkdownFenceLanguage(info);
  const DiagramFence = language ? diagramFences[language] : undefined;
  if (DiagramFence) {
    return (
      <DiagramFence
        code={code}
        phase={phase}
        dark={dark}
        theme={theme}
        inheritedStyles={inheritedStyles}
        textStyle={textStyle}
      />
    );
  }
  return (
    <HighlightedCodeBlock
      code={code}
      dark={dark}
      language={language}
      inheritedStyles={inheritedStyles}
      textStyle={textStyle}
    />
  );
}
