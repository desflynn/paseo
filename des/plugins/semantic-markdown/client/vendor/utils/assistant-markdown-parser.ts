import type MarkdownIt from "../../../shared/markdown-it.js";
import { createMarkdownParser } from "./markdown-parser.ts";
import { enableStreamingMarkdown } from "./streaming-markdown/index.ts";

export function createAssistantMarkdownParser({ streaming = false } = {}): MarkdownIt {
  const parser = createMarkdownParser({ linkify: true });
  const defaultValidateLink = parser.validateLink.bind(parser);

  // Assistant messages are the only surface allowed to link into the
  // filesystem. Every other parser keeps markdown-it's stricter default.
  parser.validateLink = (url: string) =>
    url.trim().toLowerCase().startsWith("file://") || defaultValidateLink(url);

  if (streaming) {
    enableStreamingMarkdown(parser);
  }

  return parser;
}
