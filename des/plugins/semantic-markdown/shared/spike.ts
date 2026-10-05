import MarkdownIt from "./markdown-it.js";
import { z } from "zod";
import { applyMarkdownExtensions } from "./extensions.ts";
import { hasIncompleteSemanticPair } from "./source-syntax.ts";

export const semanticKinds = [
  "ask",
  "done",
  "deferred",
  "warning",
  "danger",
  "info",
  "muted",
] as const;
export type SemanticKind = (typeof semanticKinds)[number];

export const spikeDataSchema = z.object({ text: z.string() });
export type SpikeData = z.output<typeof spikeDataSchema>;

const KINDS = semanticKinds.join("|");
const PLAIN = new RegExp(`^\\{(${KINDS})\\}[ \\t]+(.+)$`);
// Status strip: `{status}…{/status}` recognized only when the pair is the whole
// line. Anything else stays literal text.
const STATUS_TAG = "{status}";
const STATUS_CLOSE_TAG = "{/status}";
// `> [!kind] Title` card, `> [!kind]+ Title` foldable-open, `> [!kind]- Title`
// foldable-collapsed.
const CALLOUT = new RegExp(`^>\\s*\\[!(${KINDS})\\]([+-]?)(?:[ \\t]+(.*))?$`);
const HIGHLIGHT = new RegExp(`^==\\{(${KINDS})\\}[ \\t]*`);
// Paired inline tag `{kind}content{/kind}`. Wrapping the content in `==` changes
// the same span to highlight treatment: `{kind}==content=={/kind}`.
const PAIR = new RegExp(`^\\{(${KINDS})\\}`);
const SEMANTIC_TAG = new RegExp(`\\{/?(${KINDS})\\}`, "g");
const CARD_REFERENCE = /^\{card:([A-Za-z0-9_-]+)\}/;
const ESCAPED_SEMANTIC_CODE = new RegExp(
  `\\\\(?=(?:\\{(?:/?(?:${KINDS})|/?status|card:[A-Za-z0-9_-]+|/card)\\}|==|\\[!(?:${KINDS})\\]))`,
  "g",
);

type SemanticParser = MarkdownIt & { semanticCardDefinitions?: Map<string, string> };

export interface PreparedSemanticSource {
  text: string;
  cardDefinitions: Map<string, string>;
}

export function prepareSemanticSource(text: string): PreparedSemanticSource {
  const lines = text.split("\n");
  const visible: string[] = [];
  const cardDefinitions = new Map<string, string>();

  for (let index = 0; index < lines.length; index += 1) {
    const opener = /^\{card:([A-Za-z0-9_-]+)\}[ \t]*$/.exec(lines[index]);
    if (!opener) {
      visible.push(lines[index]);
      continue;
    }

    const close = lines.findIndex(
      (line, lineIndex) => lineIndex > index && /^\{\/card\}[ \t]*$/.test(line),
    );
    if (close < 0) {
      visible.push(lines[index]);
      continue;
    }

    cardDefinitions.set(opener[1], lines.slice(index + 1, close).join("\n"));
    index = close;
  }

  return { text: visible.join("\n"), cardDefinitions };
}

export function setCardDefinitions(parser: MarkdownIt, definitions: Map<string, string>): void {
  (parser as SemanticParser).semanticCardDefinitions = definitions;
}

function lineText(state: MarkdownIt.StateBlock, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let position = index - 1; position >= 0 && source[position] === "\\"; position -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function findUnescaped(source: string, needle: string, from: number): number {
  let index = source.indexOf(needle, from);
  while (index >= 0 && isEscaped(source, index)) {
    index = source.indexOf(needle, index + needle.length);
  }
  return index;
}

function hasUnescapedSemanticTag(content: string): boolean {
  if (content.includes("\n")) return true;
  const tags = new RegExp(SEMANTIC_TAG.source, "g");
  for (let match = tags.exec(content); match; match = tags.exec(content)) {
    if (!isEscaped(content, match.index)) return true;
  }
  return false;
}

function unescapeSemanticCode(tokens: MarkdownIt.Token[]): void {
  for (const token of tokens) {
    if (token.type === "code_inline") {
      token.content = token.content.replace(ESCAPED_SEMANTIC_CODE, "");
    }
    if (token.children) unescapeSemanticCode(token.children);
  }
}

function parseSemanticInline(state: MarkdownIt.StateInline, content: string): MarkdownIt.Token[] {
  const tokens: MarkdownIt.Token[] = [];
  state.md.inline.parse(content, state.md, state.env, tokens);
  unescapeSemanticCode(tokens);
  return tokens;
}

function unescapeSemanticCodeRule(state: MarkdownIt.StateCore): void {
  unescapeSemanticCode(state.tokens);
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

function semanticStatusRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
) {
  const line = lineText(state, startLine);
  if (!line.startsWith(STATUS_TAG)) return false;
  const contentStart = STATUS_TAG.length;
  const close = findUnescaped(line, STATUS_CLOSE_TAG, contentStart);
  if (close < 0) return false;
  const content = line.slice(contentStart, close);
  // Whole line only: nothing but the closer may follow it.
  if (line.slice(close + STATUS_CLOSE_TAG.length).trim() !== "") return false;
  // Tags do not nest: semantic markup inside keeps the strip literal, like pairs.
  if (hasUnescapedSemanticTag(content)) return false;

  if (silent) return true;

  const open = state.push("semantic_status_open", "p", 1);
  open.block = true;
  open.map = [startLine, startLine + 1];

  const inline = state.push("inline", "", 0);
  inline.content = content;
  inline.map = [startLine, startLine + 1];
  inline.children = [];

  state.push("semantic_status_close", "p", -1).block = true;
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

function pushSemanticHighlight(state: MarkdownIt.StateInline, kind: string, content: string) {
  const segments = content.split("\\ ");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment) {
      const open = state.push("semantic_highlight_open", "mark", 1);
      open.meta = { kind };
      for (const token of parseSemanticInline(state, segment)) state.tokens.push(token);
      state.push("semantic_highlight_close", "mark", -1);
    }
    if (index < segments.length - 1) {
      const space = state.push("text", "", 0);
      space.content = " ";
    }
  }
}

function semanticHighlightRule(state: MarkdownIt.StateInline, silent: boolean) {
  const match = HIGHLIGHT.exec(state.src.slice(state.pos));
  if (!match) return false;

  const contentStart = state.pos + match[0].length;
  const contentEnd = findUnescaped(state.src, "==", contentStart);
  if (contentEnd < 0) return false;

  if (!silent) {
    pushSemanticHighlight(state, match[1], state.src.slice(contentStart, contentEnd));
  }
  state.pos = contentEnd + 2;
  return true;
}

function semanticPairRule(state: MarkdownIt.StateInline, silent: boolean) {
  const match = PAIR.exec(state.src.slice(state.pos));
  if (!match) return false;

  const kind = match[1];
  const contentStart = state.pos + match[0].length;
  const closer = `{/${kind}}`;
  const contentEnd = findUnescaped(state.src, closer, contentStart);
  if (contentEnd < 0) return false;

  const content = state.src.slice(contentStart, contentEnd);
  if (hasUnescapedSemanticTag(content)) return false;

  if (!silent) {
    const highlighted = content.startsWith("==") && content.endsWith("==") && content.length > 4;
    const innerContent = highlighted ? content.slice(2, -2) : content;
    if (highlighted) {
      pushSemanticHighlight(state, kind, innerContent);
    } else {
      const open = state.push("semantic_inline_open", "span", 1);
      open.meta = { kind };
      // Separate list: parsing into state.tokens lets the post-pass merge tokens
      // and shift emphasis delimiter indices earlier on the line.
      for (const token of parseSemanticInline(state, innerContent)) state.tokens.push(token);
      state.push("semantic_inline_close", "span", -1);
    }
  }
  state.pos = contentEnd + closer.length;
  return true;
}

function incompleteSemanticPairRule(state: MarkdownIt.StateInline, silent: boolean) {
  const match = PAIR.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (
    state.pos >= 2 &&
    state.src.slice(state.pos - 2, state.pos) === "==" &&
    !isEscaped(state.src, state.pos - 2)
  ) {
    return false;
  }

  const contentStart = state.pos + match[0].length;
  if (findUnescaped(state.src, `{/${match[1]}}`, contentStart) >= 0) return false;
  const content = state.src.slice(contentStart);
  if (content.includes("\n") || hasUnescapedSemanticTag(content)) return false;

  if (!silent && state.pending) state.pushPending();
  state.pos = state.posMax;
  return true;
}

function semanticCardReferenceRule(state: MarkdownIt.StateInline, silent: boolean) {
  const match = CARD_REFERENCE.exec(state.src.slice(state.pos));
  if (!match) return false;
  const source = (state.md as SemanticParser).semanticCardDefinitions?.get(match[1]);
  if (!source) return false;

  if (!silent) {
    const token = state.push("semantic_card_ref", "", 0);
    token.meta = { id: match[1], source };
  }
  state.pos += match[0].length;
  return true;
}

function visibleTokenLength(token: MarkdownIt.Token): number {
  if (token.type === "semantic_card_ref") {
    return String(token.meta?.source ?? "")
      .replace(/\{\/?[^}]+\}|[>*_`|=#-]/g, " ")
      .replace(/\s+/g, " ")
      .trim().length;
  }
  if (token.children)
    return token.children.reduce((sum, child) => sum + visibleTokenLength(child), 0);
  return /^(?:text|code_inline|code_block|fence)$/.test(token.type) ? token.content.length : 0;
}

// Let genuinely tiny columns use their natural share instead of the prose floor.
const TINY_COLUMN_LENGTH = 2;

function boundedColumnFlexes(lengths: number[]): number[] {
  const count = lengths.length;
  if (count <= 1) return count === 1 ? [1] : [];
  const positive = lengths.map((length) => Math.max(1, length));
  if (Math.max(...positive) / Math.min(...positive) <= 1.25) {
    return positive.map(() => 1 / count);
  }

  const weights = positive.map(Math.sqrt);
  const minimum = 0.6 / count;
  const maximum = Math.min(0.7, 1.8 / count);
  const tiny = positive.map((length) => length <= TINY_COLUMN_LENGTH);
  const shares = Array<number>(count).fill(0);
  const active = new Set(weights.keys());
  let remaining = 1;

  while (active.size > 0) {
    const weightTotal = [...active].reduce((sum, index) => sum + weights[index], 0);
    const candidate = (index: number) => (remaining * weights[index]) / weightTotal;
    const aboveMaximum = [...active].find((index) => candidate(index) > maximum);
    if (aboveMaximum !== undefined) {
      shares[aboveMaximum] = maximum;
      remaining -= maximum;
      active.delete(aboveMaximum);
      continue;
    }
    const belowMinimum = [...active].find((index) => !tiny[index] && candidate(index) < minimum);
    if (belowMinimum !== undefined) {
      shares[belowMinimum] = minimum;
      remaining -= minimum;
      active.delete(belowMinimum);
      continue;
    }
    for (const index of active) shares[index] = candidate(index);
    break;
  }

  return shares.map((share) => Number(share.toFixed(6)));
}

function annotateTableColumnWidths(state: MarkdownIt.StateCore): void {
  for (let tableStart = 0; tableStart < state.tokens.length; tableStart += 1) {
    if (state.tokens[tableStart].type !== "table_open") continue;
    const cells: Array<{ token: MarkdownIt.Token; column: number; length: number }> = [];
    let column = 0;
    let columnCount = 0;

    for (let index = tableStart + 1; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type === "table_close") {
        const lengths = Array.from({ length: columnCount }, (_, cellColumn) =>
          Math.max(
            ...cells.filter((cell) => cell.column === cellColumn).map((cell) => cell.length),
          ),
        );
        const flexes = boundedColumnFlexes(lengths);
        for (const cell of cells)
          cell.token.attrSet("data-semantic-flex", String(flexes[cell.column]));
        tableStart = index;
        break;
      }
      if (token.type === "tr_open") column = 0;
      if (token.type !== "th_open" && token.type !== "td_open") continue;
      const close = state.tokens.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && candidate.type === token.type.replace("_open", "_close"),
      );
      cells.push({
        token,
        column,
        length: state.tokens
          .slice(index + 1, close)
          .reduce((sum, child) => sum + visibleTokenLength(child), 0),
      });
      column += 1;
      columnCount = Math.max(columnCount, column);
    }
  }
}

/** Semantic grammar + markdown extensions installed onto any parser instance. */
export function applySemanticRules(parser: MarkdownIt, streaming = false): MarkdownIt {
  parser.block.ruler.before("blockquote", "semantic_callout", semanticCalloutRule);
  // alt: a status line ends the paragraph above it, so it needs no blank line before it.
  parser.block.ruler.before("paragraph", "semantic_status", semanticStatusRule, {
    alt: ["paragraph"],
  });
  parser.block.ruler.before("paragraph", "semantic_text", semanticTextRule);
  parser.inline.ruler.before("emphasis", "semantic_highlight", semanticHighlightRule);
  parser.inline.ruler.before("emphasis", "semantic_pair", semanticPairRule);
  if (streaming) {
    parser.inline.ruler.before(
      "semantic_pair",
      "semantic_pair_pending",
      incompleteSemanticPairRule,
    );
  }
  parser.inline.ruler.before("emphasis", "semantic_card_ref", semanticCardReferenceRule);
  parser.core.ruler.after("inline", "semantic_code_escapes", unescapeSemanticCodeRule);
  parser.core.ruler.after(
    "semantic_code_escapes",
    "semantic_table_widths",
    annotateTableColumnWidths,
  );
  applyMarkdownExtensions(parser);
  return parser;
}

export function createSemanticMarkdownParser() {
  return applySemanticRules(MarkdownIt({ html: false, linkify: true }));
}

/** Parse; the footnote_number core rule assigns footnote numbers. */
export function parseSemanticMarkdown(parser: MarkdownIt, text: string): MarkdownIt.Token[] {
  const prepared = prepareSemanticSource(text);
  setCardDefinitions(parser, prepared.cardDefinitions);
  return parser.parse(prepared.text, {});
}

const PLUGIN_TOKEN = /^(semantic_|math_|footnote_|kbd)/;
// The plugin claims exactly semantic markup, GFM tables, fenced code blocks
// (Mermaid included), and blockquotes. Headings, lists, emphasis, links, and
// inline code stay with Paseo's renderer.
const CLAIMED_BLOCK = new Set(["table_open", "fence", "blockquote_open"]);

function claimsMessage(tokens: MarkdownIt.Token[]): boolean {
  return tokens.some(
    (token) =>
      PLUGIN_TOKEN.test(token.type) ||
      CLAIMED_BLOCK.has(token.type) ||
      claimsMessage(token.children ?? []),
  );
}

const detector = createSemanticMarkdownParser();

export function parseSpike(text: string, streaming = false): SpikeData | undefined {
  return claimsMessage(parseSemanticMarkdown(detector, text)) ||
    (streaming && hasIncompleteSemanticPair(text))
    ? { text }
    : undefined;
}

/** Debug until stable: why the detector did or did not claim a message. */
export function diagnoseParse(text: string): string {
  const rules = (ruler: { __rules__?: { name: string }[] }) =>
    (ruler.__rules__ ?? []).map((rule) => rule.name).join(",");
  const tokens = parseSemanticMarkdown(detector, text);
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
