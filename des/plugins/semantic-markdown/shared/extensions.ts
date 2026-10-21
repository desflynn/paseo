import MarkdownIt from "./markdown-it.js";
import type { Token } from "./markdown-it.js";

// Markdown-it extension rules for the semantic-markdown plugin: inline/block
// math ($…$ / $$…$$), footnotes ([^label] + [^label]: def), and <kbd> keys.
// All rules are parser-only — rendering lives in the client render rules.

type BlockRule = NonNullable<Parameters<MarkdownIt["block"]["ruler"]["before"]>[2]>;

function lineText(state: MarkdownIt.StateBlock, line: number) {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

// --- Math -------------------------------------------------------------------

// Pandoc-style inline math guards: no whitespace directly after the opening
// `$` or directly before the closing `$`, no newline inside, and no further
// `$` may appear inside. Keeps prose like "$5 and $10" literal.
const INLINE_MATH = /\$([^$\n]+)\$/;
const INLINE_MATH_FULL = /^\$([^$\n]+)\$/;

function mathInlineRule(state: MarkdownIt.StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;
  const rest = state.src.slice(state.pos);
  const match = INLINE_MATH_FULL.exec(rest);
  if (!match) return false;
  const latex = match[1];
  if (/\s/.test(latex[0]) || /\s/.test(latex[latex.length - 1])) return false;

  if (!silent) {
    const token = state.push("math_inline", "", 0);
    token.content = latex;
    token.meta = { latex };
  }
  state.pos += match[0].length;
  return true;
}

function mathBlockRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const first = lineText(state, startLine).trim();
  if (!first.startsWith("$$")) return false;

  // Single-line form: $$ … $$
  const single = /^\$\$(.*)\$\$$/.exec(first);
  if (single) {
    if (silent) return true;
    pushMathBlock(state, startLine, startLine + 1, single[1].trim());
    return true;
  }
  if (first !== "$$") return false;

  let nextLine = startLine + 1;
  while (nextLine < endLine) {
    if (lineText(state, nextLine).trim() === "$$") {
      if (silent) return true;
      const latex = state.getLines(startLine + 1, nextLine, state.tShift[startLine + 1], false);
      pushMathBlock(state, startLine, nextLine + 1, latex.trim());
      return true;
    }
    nextLine += 1;
  }
  return false;
}

function pushMathBlock(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  latex: string,
) {
  const token = state.push("math_block", "", 0);
  token.block = true;
  token.map = [startLine, endLine];
  token.content = latex;
  token.meta = { latex };
  state.line = endLine;
}

// --- Footnotes --------------------------------------------------------------

const FOOTNOTE_REF = /^\[\^([^\s\]]+)\]/;
const FOOTNOTE_DEF = /^\[\^([^\s\]]+)\]:[ \t]*(.*)$/;

function footnoteRefRule(state: MarkdownIt.StateInline, silent: boolean): boolean {
  const match = FOOTNOTE_REF.exec(state.src.slice(state.pos));
  if (!match) return false;

  if (!silent) {
    const token = state.push("footnote_ref", "", 0);
    token.meta = { label: match[1], index: null };
  }
  state.pos += match[0].length;
  return true;
}

function footnoteBlockRule(
  state: MarkdownIt.StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const match = FOOTNOTE_DEF.exec(lineText(state, startLine));
  if (!match) return false;
  if (silent) return true;

  const open = state.push("footnote_block_open", "section", 1);
  open.block = true;
  open.map = [startLine, startLine + 1];
  open.meta = { label: match[1], index: null };

  const inline = state.push("inline", "", 0);
  inline.content = match[2];
  inline.map = [startLine, startLine + 1];
  inline.children = [];

  state.push("footnote_block_close", "section", -1).block = true;
  state.line = startLine + 1;
  return true;
}

/**
 * Assign footnote numbers by first reference appearance in document order and
 * resolve definitions. Mutates token meta in place:
 * - refs get `{ label, index }` (`index: null` when unresolved → render literal)
 * - defs get `{ label, index }` (`index: null` when never referenced → hidden)
 */
export function numberFootnotes(tokens: Token[], known?: Map<string, number>): Map<string, number> {
  const defLabels = new Set<string>();
  const collectDefs = (list: Token[]) => {
    for (const token of list) {
      if (token.type === "footnote_block_open") defLabels.add(String(token.meta?.label ?? ""));
      if (token.children) collectDefs(token.children);
    }
  };
  collectDefs(tokens);

  // A known (whole-message) map wins: the renderer parses each block on its own,
  // so a ref and its definition are rarely in the same parse.
  const indices = known ?? new Map<string, number>();
  const visit = (list: Token[]) => {
    for (const token of list) {
      if (token.type === "footnote_ref") {
        const label = String(token.meta?.label ?? "");
        // Unresolved refs (no matching definition) keep a null index so the
        // renderer falls back to the literal `[^label]` text.
        if (!known && defLabels.has(label) && !indices.has(label))
          indices.set(label, indices.size + 1);
        token.meta = { ...token.meta, index: indices.get(label) ?? null };
      } else if (token.type === "footnote_block_open") {
        const label = String(token.meta?.label ?? "");
        token.meta = { ...token.meta, index: indices.get(label) ?? null };
      }
      if (token.children) visit(token.children);
    }
  };
  visit(tokens);

  // Defs may be walked before their refs (doc-order single pass); re-assign
  // def indices now that refs have their final numbers.
  const fixDefs = (list: Token[]) => {
    for (const token of list) {
      if (token.type === "footnote_block_open") {
        const label = String(token.meta?.label ?? "");
        token.meta = { ...token.meta, index: indices.get(label) ?? null };
      }
      if (token.children) fixDefs(token.children);
    }
  };
  fixDefs(tokens);
  return indices;
}

type FootnoteParser = MarkdownIt & { footnoteIndices?: Map<string, number> };

/** Number this parser's footnotes from the whole message, before it parses each block. */
export function setMessageFootnotes(parser: MarkdownIt, text: string): void {
  const p = parser as FootnoteParser;
  p.footnoteIndices = undefined;
  p.footnoteIndices = numberFootnotes(parser.parse(text, {}));
}

// --- <kbd> keys -------------------------------------------------------------

const KBD = /^<kbd>([^<\n]+)<\/kbd>/;

function kbdRule(state: MarkdownIt.StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "<") return false;
  const match = KBD.exec(state.src.slice(state.pos));
  if (!match) return false;

  if (!silent) {
    const token = state.push("kbd", "", 0);
    token.content = match[1];
    token.meta = { key: match[1] };
  }
  state.pos += match[0].length;
  return true;
}

// --- Installation -----------------------------------------------------------

export function applyMarkdownExtensions(parser: MarkdownIt): MarkdownIt {
  // footnote_block must precede the core `reference` rule — `[^a]: word` is a
  // syntactically valid link-reference definition and would be swallowed
  // silently otherwise.
  parser.block.ruler.before("reference", "footnote_block", footnoteBlockRule as BlockRule);
  parser.block.ruler.before("paragraph", "math_block", mathBlockRule as BlockRule);
  parser.inline.ruler.before("escape", "kbd", kbdRule);
  parser.inline.ruler.before("link", "footnote_ref", footnoteRefRule);
  parser.inline.ruler.before("emphasis", "math_inline", mathInlineRule);
  parser.core.ruler.push("footnote_number", (state) => {
    numberFootnotes(state.tokens, (state.md as FootnoteParser).footnoteIndices);
    return true;
  });
  return parser;
}

export { INLINE_MATH };
