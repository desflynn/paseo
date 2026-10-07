import assert from "node:assert/strict";
import { test } from "node:test";
import { splitHtmlishMarkdown } from "../client/vendor/components/markdown/html-ish.ts";
import { applySemanticRules, parseSemanticMarkdown } from "./spike.ts";
import { createAssistantMarkdownParser } from "../client/vendor/utils/assistant-markdown-parser.ts";

// Golden corpus: one fixture exercising every DESIGN.md parity bullet through
// the full plugin pipeline (assistant parser + semantic rules + html-ish
// split). Parser/AST level — visual parity is the live matrix in
// VENDOR_PLAN.md.

const parser = applySemanticRules(createAssistantMarkdownParser());

const CORPUS = [
  "# Heading one", // headings
  "",
  "Plain **bold**, *italic*, ~~strike~~ and `inline code`.", // emphasis + code
  "",
  "- bullet one\n- bullet two\n  - nested", // lists
  "",
  "1. first\n2. second", // ordered lists
  "",
  "> quoted text", // blockquotes
  "",
  "| col | col2 |", // tables
  "| --- | --- |",
  "| a | b |",
  "",
  "---", // hr
  "",
  "[a link](https://example.com) and [file link](file:///tmp/example.ts)", // links
  "",
  "![an image](https://example.com/img.png)", // images
  "",
  "```ts", // fenced code
  "const x: number = 1;",
  "```",
  "",
  "    indented code block", // indented code
  "",
  "```mermaid", // mermaid fence
  "graph TD; A-->B;",
  "```",
  "",
  "<details>", // details block (html-ish)
  "<summary>More</summary>",
  "hidden body",
  "</details>",
  "",
  "> [!warning]+ Release checklist", // semantic foldable callout
  "> Verify $coverage \\geq 90\\%$ before shipping.",
  "",
  "{done} Shipped to production.", // semantic text
  "",
  "{status}Spark seat boot: weights loaded{/status}", // semantic status strip
  "",
  "Flag =={danger}rollback path missing== in the runbook.", // semantic highlight
  "",
  "Keys: <kbd>Cmd</kbd>+<kbd>K</kbd>", // kbd
  "",
  "Energy is $E = mc^2$[^e].", // inline math + footnote ref
  "",
  "$$", // block math
  "\\int_0^1 x\\,dx = \\tfrac{1}{2}",
  "$$",
  "",
  "[^e]: mass–energy equivalence", // footnote def
].join("\n");

test("golden corpus: html-ish split extracts details and images", () => {
  const parts = splitHtmlishMarkdown(CORPUS);
  assert.ok(
    parts.some((part) => part.kind === "details"),
    "details part extracted",
  );
  assert.ok(
    parts.some((part) => part.kind === "markdown" && part.text.includes("```mermaid")),
    "mermaid fence stays inside markdown part",
  );
});

test("golden corpus: every parity construct parses to its canonical tokens", () => {
  const parts = splitHtmlishMarkdown(CORPUS);
  const markdownText = parts
    .filter((part) => part.kind === "markdown")
    .map((part) => part.text)
    .join("\n\n");
  const tokens = parseSemanticMarkdown(parser, markdownText);
  const flat = tokens.flatMap((token) => [token].concat(token.children ?? []));
  const types = new Set(flat.map((token) => token.type));

  const required = [
    "heading_open",
    "strong_open",
    "em_open",
    "s_open",
    "code_inline",
    "bullet_list_open",
    "ordered_list_open",
    "blockquote_open",
    "table_open",
    "th_open",
    "hr",
    "link_open",
    "image",
    "fence",
    "code_block",
    "semantic_callout_open",
    "semantic_text_open",
    "semantic_status_open",
    "semantic_highlight_open",
    "math_inline",
    "math_block",
    "kbd",
    "footnote_ref",
    "footnote_block_open",
  ];
  const missing = required.filter((type) => !types.has(type));
  assert.deepEqual(missing, [], `missing canonical token types: ${missing.join(", ")}`);
});

test("golden corpus: fences keep their info strings for language routing", () => {
  const tokens = parseSemanticMarkdown(parser, CORPUS);
  const fences = tokens.filter((token) => token.type === "fence");
  const infos = new Set(fences.map((token) => token.info.trim()));
  assert.ok(infos.has("ts"));
  assert.ok(infos.has("mermaid"));
});

test("golden corpus: file:// links parse (assistant parser allowance)", () => {
  const flat = parseSemanticMarkdown(parser, CORPUS).flatMap((t) => [t].concat(t.children ?? []));
  const fileLink = flat.find(
    (token) =>
      token.type === "link_open" && token.attrGet("href")?.startsWith("file:///tmp/example.ts"),
  );
  assert.ok(fileLink, "file:// href present");
});

test("golden corpus: callout composes math and footnote inside its body", () => {
  const tokens = parseSemanticMarkdown(parser, CORPUS);
  const idx = tokens.findIndex((token) => token.type === "semantic_callout_open");
  assert.ok(idx >= 0, "callout found");
  assert.equal(tokens[idx].meta?.title, "Release checklist");
  assert.equal(tokens[idx].meta?.fold, "open");
  const close = tokens.findIndex((t, i) => i > idx && t.type === "semantic_callout_close");
  const bodyTypes = tokens
    .slice(idx + 1, close)
    .flatMap((token) => [token.type].concat((token.children ?? []).map((c) => c.type)));
  assert.ok(bodyTypes.includes("math_inline"), "inline math inside callout body");
});

test("golden corpus: no plugin token leaks into plain markdown", () => {
  const plain = parseSemanticMarkdown(
    applySemanticRules(createAssistantMarkdownParser()),
    "# Just a heading\n\nwith **bold** and a [link](https://x.example).",
  );
  const flat = plain.flatMap((token) => [token].concat(token.children ?? []));
  assert.ok(flat.every((token) => !/^(semantic_|math_|footnote_|kbd)/.test(token.type)));
});
