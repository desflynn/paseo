import MarkdownIt from "./markdown-it.js";
import { z } from "zod";
import { applyMarkdownExtensions } from "./extensions.ts";

export const semanticKinds = ["ask", "done", "deferred", "warning", "danger", "info"] as const;
export type SemanticKind = (typeof semanticKinds)[number];

export const spikeDataSchema = z.object({ text: z.string() });
export type SpikeData = z.output<typeof spikeDataSchema>;

const KINDS = semanticKinds.join("|");
const PLAIN = new RegExp(`^\\{(${KINDS})\\}[ \\t]+(.+)$`);
// `> [!kind] Title` card, `> [!kind]+ Title` foldable-open, `> [!kind]- Title`
// foldable-collapsed.
const CALLOUT = new RegExp(`^>\\s*\\[!(${KINDS})\\]([+-]?)(?:[ \\t]+(.*))?$`);
const HIGHLIGHT = new RegExp(`^==\\{(${KINDS})\\}[ \\t]*`);

function lineText(state: MarkdownIt.StateBlock, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function semanticTextRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
) {
  const match = PLAIN.exec(lineText(state, startLine));
  if (!match) return false;
  if (silent) return true;

  const open = state.push("semantic_text_open", "p", 1);
  open.block = true;
  open.map = [startLine, startLine + 1];
  open.meta = { kind: match[1] };

  const inline = state.push("inline", "", 0);
  inline.content = match[2];
  inline.map = [startLine, startLine + 1];
  inline.children = [];

  state.push("semantic_text_close", "p", -1).block = true;
  state.line = startLine + 1;
  return true;
}

function semanticCalloutRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
) {
  const match = CALLOUT.exec(lineText(state, startLine));
  if (!match) return false;
  if (silent) return true;

  let fold: "open" | "collapsed" | null = null;
  if (match[2] === "+") fold = "open";
  else if (match[2] === "-") fold = "collapsed";
  // Obsidian: the rest of the first line is the title, fold marker or not.
  const title = match[3] ?? (fold ? "" : null);
  const body: string[] = [];
  let nextLine = startLine + 1;
  while (nextLine < endLine) {
    const continuation = /^> ?(.*)$/.exec(lineText(state, nextLine));
    if (!continuation) break;
    body.push(continuation[1]);
    nextLine += 1;
  }

  const open = state.push("semantic_callout_open", "aside", 1);
  open.block = true;
  open.map = [startLine, nextLine];
  open.meta = { kind: match[1], title, fold };
  if (body.length > 0) state.md.block.parse(body.join("\n"), state.md, state.env, state.tokens);
  state.push("semantic_callout_close", "aside", -1).block = true;
  state.line = nextLine;
  return true;
}

function semanticHighlightRule(state: MarkdownIt.StateInline, silent: boolean) {
  const match = HIGHLIGHT.exec(state.src.slice(state.pos));
  if (!match) return false;

  const contentStart = state.pos + match[0].length;
  const contentEnd = state.src.indexOf("==", contentStart);
  if (contentEnd < 0) return false;

  if (!silent) {
    const open = state.push("semantic_highlight_open", "mark", 1);
    open.meta = { kind: match[1] };
    // Parse into a separate list: parsing into state.tokens lets its post-pass
    // merge tokens and shift the indices of emphasis delimiters earlier on the line.
    const inner: MarkdownIt.Token[] = [];
    state.md.inline.parse(state.src.slice(contentStart, contentEnd), state.md, state.env, inner);
    for (const token of inner) state.tokens.push(token);
    state.push("semantic_highlight_close", "mark", -1);
  }
  state.pos = contentEnd + 2;
  return true;
}

/** Semantic grammar + markdown extensions installed onto any parser instance. */
export function applySemanticRules(parser: MarkdownIt): MarkdownIt {
  parser.block.ruler.before("blockquote", "semantic_callout", semanticCalloutRule);
  parser.block.ruler.before("paragraph", "semantic_text", semanticTextRule);
  parser.inline.ruler.before("emphasis", "semantic_highlight", semanticHighlightRule);
  applyMarkdownExtensions(parser);
  return parser;
}

export function createSemanticMarkdownParser() {
  return applySemanticRules(MarkdownIt({ html: false, linkify: true }));
}

/** Parse; the footnote_number core rule assigns footnote numbers. */
export function parseSemanticMarkdown(parser: MarkdownIt, text: string): MarkdownIt.Token[] {
  return parser.parse(text, {});
}

const PLUGIN_TOKEN = /^(semantic_|math_|footnote_|kbd)/;

function containsSemanticToken(tokens: MarkdownIt.Token[]): boolean {
  return tokens.some(
    (token) => PLUGIN_TOKEN.test(token.type) || containsSemanticToken(token.children ?? []),
  );
}

const detector = createSemanticMarkdownParser();

export function parseSpike(text: string): SpikeData | undefined {
  return containsSemanticToken(detector.parse(text, {})) ? { text } : undefined;
}

/** Debug until stable: why the detector did or did not claim a message. */
export function diagnoseParse(text: string): string {
  const rules = (ruler: { __rules__?: { name: string }[] }) =>
    (ruler.__rules__ ?? []).map((rule) => rule.name).join(",");
  const tokens = detector.parse(text, {});
  const types: string[] = [];
  const walk = (list: MarkdownIt.Token[]) => {
    for (const token of list) {
      types.push(token.type);
      walk(token.children ?? []);
    }
  };
  walk(tokens);
  return [
    `block rules: ${rules(detector.block.ruler as never)}`,
    `inline rules: ${rules(detector.inline.ruler as never)}`,
    `tokens (${types.length}): ${types.slice(0, 60).join(" ")}`,
    `PLUGIN_TOKEN test on "semantic_text": ${PLUGIN_TOKEN.test("semantic_text")}`,
  ].join("\n");
}
