import assert from "node:assert/strict";
import { test } from "node:test";
import { numberFootnotes, setMessageFootnotes } from "./extensions.ts";
import { createSemanticMarkdownParser, parseSpike, parseSemanticMarkdown } from "./spike.ts";

const parser = createSemanticMarkdownParser();

function tokenTypes(text: string) {
  const tokens = parseSemanticMarkdown(parser, text);
  return tokens.flatMap((token) => [token].concat(token.children ?? []));
}

function find(tokens: ReturnType<typeof tokenTypes>, type: string) {
  return tokens.find((token) => token.type === type);
}

// --- math -------------------------------------------------------------------

test("inline math produces math_inline tokens", () => {
  const tokens = tokenTypes("Energy: $E = mc^2$ inline.");
  const token = find(tokens, "math_inline");
  assert.equal(token?.meta?.latex, "E = mc^2");
});

test("dollar amounts stay literal", () => {
  const tokens = tokenTypes("It costs $5 and $10 in total.");
  assert.equal(find(tokens, "math_inline"), undefined);
});

test("block math fenced with $$ on its own lines", () => {
  const tokens = tokenTypes("$$\nx^2 + y^2 = z^2\n$$");
  assert.equal(find(tokens, "math_block")?.meta?.latex, "x^2 + y^2 = z^2");
});

test("single-line block math", () => {
  const tokens = tokenTypes("$$a^2+b^2=c^2$$");
  assert.equal(find(tokens, "math_block")?.meta?.latex, "a^2+b^2=c^2");
});

test("unterminated $$ stays literal prose", () => {
  const tokens = tokenTypes("$$\nbroken math");
  assert.equal(find(tokens, "math_block"), undefined);
});

test("escaped dollar stays literal", () => {
  const tokens = tokenTypes("\\$5 is not math\\$");
  assert.equal(find(tokens, "math_inline"), undefined);
});

test("math inside code spans stays literal", () => {
  const tokens = tokenTypes("`$E = mc^2$` is code");
  assert.equal(find(tokens, "math_inline"), undefined);
  assert.ok(tokens.some((token) => token.type === "code_inline"));
});

test("math-only messages are claimed by the transformer", () => {
  assert.deepEqual(parseSpike("Value is $x_1 + x_2$."), { text: "Value is $x_1 + x_2$." });
});

// --- footnotes --------------------------------------------------------------

test("footnote refs and defs are numbered by first appearance", () => {
  const tokens = tokenTypes("Alpha[^a] beta[^b] again[^a].\n\n[^a]: first\n[^b]: second");
  const refs = tokens.filter((token) => token.type === "footnote_ref");
  assert.deepEqual(
    refs.map((token) => token.meta?.index),
    [1, 2, 1],
  );
  const defs = tokens.filter((token) => token.type === "footnote_block_open");
  assert.equal(defs.find((token) => token.meta?.label === "a")?.meta?.index, 1);
  assert.equal(defs.find((token) => token.meta?.label === "b")?.meta?.index, 2);
});

test("unresolved footnote refs keep a null index", () => {
  const tokens = tokenTypes("Nope[^missing].");
  assert.equal(find(tokens, "footnote_ref")?.meta?.index, null);
});

test("unreferenced footnote defs are hidden (null index)", () => {
  const tokens = tokenTypes("Just prose.\n\n[^orphan]: nobody cites me");
  assert.equal(find(tokens, "footnote_block_open")?.meta?.index, null);
});

test("footnote definition body keeps nested markdown", () => {
  const tokens = tokenTypes("See[^n].\n\n[^n]: the **bold** truth");
  const defInline = tokens.find(
    (token) => token.type === "inline" && token.content === "the **bold** truth",
  );
  assert.ok(defInline);
  assert.ok(defInline.children?.some((token) => token.type === "strong_open"));
});

test("plain bracketed links are not footnote refs", () => {
  const tokens = tokenTypes("[a normal link](https://example.com)");
  assert.equal(find(tokens, "footnote_ref"), undefined);
});

// --- kbd --------------------------------------------------------------------

test("kbd tags become kbd tokens", () => {
  const tokens = tokenTypes("Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy.");
  const keys = tokens.filter((token) => token.type === "kbd");
  assert.deepEqual(
    keys.map((token) => token.meta?.key),
    ["Ctrl", "C"],
  );
});

test("unmatched kbd-like html stays literal", () => {
  const tokens = tokenTypes("<kbd>unclosed and <foo>");
  assert.equal(tokens.filter((token) => token.type === "kbd").length, 0);
});

test("kbd inside code spans stays literal", () => {
  const tokens = tokenTypes("`<kbd>x</kbd>`");
  assert.equal(find(tokens, "kbd"), undefined);
});

// --- footnotes across render blocks ----------------------------------------

test("footnotes number from the whole message when blocks parse separately", () => {
  const blockParser = createSemanticMarkdownParser();
  setMessageFootnotes(blockParser, "Ref here.[^n]\n\n```ts\nx\n```\n\n[^n]: Note text.");
  const ref = blockParser.parse("Ref here.[^n]", {}).flatMap((t) => t.children ?? []);
  assert.equal(find(ref, "footnote_ref")?.meta?.index, 1);
  const def = blockParser.parse("[^n]: Note text.", {});
  assert.equal(find(def, "footnote_block_open")?.meta?.index, 1);
});

// --- highlights ------------------------------------------------------------

test("bold before a highlight keeps its own text", () => {
  const children = tokenTypes("**Label.** =={ask}ask== · =={done}done==");
  const types = children.map((token) => token.type);
  const strongOpen = types.indexOf("strong_open");
  assert.equal(children[strongOpen + 1].content, "Label.");
  assert.equal(types[strongOpen + 2], "strong_close");
  const markOpen = types.indexOf("semantic_highlight_open");
  assert.equal(children[markOpen + 1].content, "ask");
  assert.ok(children.some((token) => token.type === "text" && token.content.includes("·")));
});

// --- callout folding + titles ----------------------------------------------

test("fold-open callouts carry title and fold state", () => {
  const tokens = tokenTypes("> [!info]+ Deploy steps\n> 1. Build\n> 2. Ship");
  const open = find(tokens, "semantic_callout_open");
  assert.deepEqual(open?.meta, { kind: "info", title: "Deploy steps", fold: "open" });
});

test("fold-collapsed callouts carry title and fold state", () => {
  const tokens = tokenTypes("> [!danger]- Do not touch\n> Restarting kills agents");
  assert.deepEqual(find(tokens, "semantic_callout_open")?.meta, {
    kind: "danger",
    title: "Do not touch",
    fold: "collapsed",
  });
});

test("foldable callouts may be untitled", () => {
  const tokens = tokenTypes("> [!ask]-\n> hidden question");
  assert.deepEqual(find(tokens, "semantic_callout_open")?.meta, {
    kind: "ask",
    title: "",
    fold: "collapsed",
  });
});

test("markerless callouts take the rest of the line as title, like Obsidian", () => {
  const tokens = tokenTypes("> [!info] quick note\n> more body");
  assert.deepEqual(find(tokens, "semantic_callout_open")?.meta, {
    kind: "info",
    title: "quick note",
    fold: null,
  });
  assert.ok(
    !tokens.some((token) => token.type === "inline" && token.content.includes("quick note")),
  );
});

test("markerless untitled callouts have no title", () => {
  const tokens = tokenTypes("> [!info]\n> body");
  assert.equal(find(tokens, "semantic_callout_open")?.meta?.title, null);
});

test("callout bodies compose with math and kbd", () => {
  const tokens = tokenTypes("> [!done]\n> Press <kbd>Enter</kbd> when $x=1$ holds");
  assert.ok(tokens.some((token) => token.type === "kbd"));
  assert.ok(tokens.some((token) => token.type === "math_inline"));
});

// --- status strip ------------------------------------------------------------

// `{status}…{/status}` is a strip only when the pair is the whole line.
// Anything else — mid-sentence, unclosed, multi-line — stays literal.

test("whole-line status pair becomes a semantic_status strip node", () => {
  const tokens = tokenTypes("{status}Spark seat boot: weights loaded{/status}");
  assert.ok(find(tokens, "semantic_status_open"));
  const inline = tokens.find((token) => token.type === "inline");
  assert.equal(inline?.content, "Spark seat boot: weights loaded");
});

test("status line right after a text line still becomes a strip", () => {
  const tokens = tokenTypes("Booting the Spark seat.\n{status}weights loaded{/status}");
  assert.ok(find(tokens, "semantic_status_open"));
});

test("status strip claims the message for the transformer", () => {
  assert.deepEqual(parseSpike("{status}weights loaded{/status}"), {
    text: "{status}weights loaded{/status}",
  });
});

test("inline status tag mid-sentence stays literal", () => {
  const tokens = tokenTypes("Boot {status}weights loaded{/status} continues.");
  assert.equal(find(tokens, "semantic_status_open"), undefined);
});

test("unclosed status tag stays literal", () => {
  const tokens = tokenTypes("{status}weights loading");
  assert.equal(find(tokens, "semantic_status_open"), undefined);
});

test("multi-line status pair stays literal", () => {
  const tokens = tokenTypes("{status}line one\nline two{/status}");
  assert.equal(find(tokens, "semantic_status_open"), undefined);
});

test("escaped status tags stay literal", () => {
  const tokens = tokenTypes("\\{status}weights loaded\\{/status}");
  assert.equal(find(tokens, "semantic_status_open"), undefined);
});

test("status content holding another semantic tag stays literal, inner tag parses", () => {
  const tokens = tokenTypes("{status}{done}loaded{/done}{/status}");
  assert.equal(find(tokens, "semantic_status_open"), undefined);
  const flat = tokens.flatMap((token) => [token].concat(token.children ?? []));
  assert.ok(flat.some((token) => token.type === "semantic_inline_open"));
});

test("status content keeps inline markdown", () => {
  const tokens = tokenTypes("{status}boot **fast** mode{/status}");
  const inline = tokens.find(
    (token) => token.type === "inline" && token.content === "boot **fast** mode",
  );
  assert.ok(inline?.children?.some((child) => child.type === "strong_open"));
});

// --- numberFootnotes unit edge ---------------------------------------------

test("numberFootnotes walks inline children", () => {
  const tokens = tokenTypes("Ref[^x] in **bold** context.\n\n[^x]: def");
  const refInChild = tokens.some(
    (token) => token.type === "inline" && token.children?.some((c) => c.type === "footnote_ref"),
  );
  assert.ok(refInChild, "footnote_ref should be found inside inline children");
});

test("numberFootnotes handles empty input", () => {
  numberFootnotes([]);
  assert.ok(true);
});
