import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  TRAILING_CODE_LINE_BREAKS,
  markdownCopyCodeBlockDataSet,
  markdownCopyDataSet,
  markdownCopyOrderedListDataSet,
  markdownCopyTableCellDataSet,
  type MarkdownCopyInlineTag,
} from "../client/vendor/assistant-selection-copy/markup.ts";
import { CODE_SURFACE_DATASET } from "../client/vendor/styles/code-surface.ts";

// Selection/copy is blocking parity: the app's DOM selection manager and the
// mobile long-press copy path both consume these dataSets and copy tags. The
// render rules in client/semantic-markdown.tsx reference every key below — a
// missing or renamed key here breaks selection semantics silently.

test("block copy dataSets exist for every block the assistant rules tag", () => {
  const required = [
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "hr",
    "table",
    "thead",
    "tbody",
    "tr",
    "li",
    "ul",
    "ol",
    "pre",
    "listMarker",
    "ignore",
  ] as const;
  for (const key of required) {
    const entry = markdownCopyDataSet[key];
    assert.ok(entry, `markdownCopyDataSet.${key} missing`);
    assert.ok(
      "paseoMarkdownTag" in entry || "paseoMarkdownIgnore" in entry,
      `${key} carries no tag`,
    );
  }
});

test("inline copy tags cover every mark the assistant rules emit", () => {
  const required: MarkdownCopyInlineTag[] = ["strong", "em", "s", "code", "br"];
  for (const tag of required) {
    assert.equal(markdownCopyDataSet[tag].paseoMarkdownTag, tag);
  }
});

test("ordered lists carry their start attribute for copy fidelity", () => {
  assert.equal(markdownCopyOrderedListDataSet(3).paseoMarkdownListStart, "3");
  assert.equal(markdownCopyOrderedListDataSet(undefined).paseoMarkdownListStart, "1");
});

test("table cells tag their axis and alignment", () => {
  assert.equal(markdownCopyTableCellDataSet("th", undefined).paseoMarkdownTag, "th");
  assert.equal(markdownCopyTableCellDataSet("td", "text-align: right").paseoMarkdownAlign, "right");
});

test("code surfaces mark their language and monospace surface", () => {
  assert.equal(markdownCopyCodeBlockDataSet("ts").paseoMarkdownLanguage, "ts");
  assert.equal(markdownCopyCodeBlockDataSet("ts long info").paseoMarkdownLanguage, "ts");
  assert.equal("paseoMarkdownLanguage" in markdownCopyCodeBlockDataSet(null), false);
  assert.ok(CODE_SURFACE_DATASET.pmono !== undefined);
});

test("code copy strips trailing blank lines that would run in a terminal", () => {
  assert.equal("ls -la\ncd ..".replace(TRAILING_CODE_LINE_BREAKS, ""), "ls -la\ncd ..");
  assert.equal("npm test\n\n\n".replace(TRAILING_CODE_LINE_BREAKS, ""), "npm test");
  assert.equal("x\n".replace(TRAILING_CODE_LINE_BREAKS, ""), "x");
});

test("lowered client bundle excludes the legacy FitImage runtime", async () => {
  const bundle = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/main.lowered.js"),
    "utf8",
  );
  assert.doesNotMatch(bundle, /node_modules\/react-native-fit-image|__extends\(FitImage/);
  assert.doesNotMatch(bundle, /import React\d*(?:,\s*\{[^}]+\})? from "react"/);
  assert.doesNotMatch(bundle, /ReactSharedInternals/);
});

test("lowered client bundle avoids strict-mode MarkdownIt function interop", async () => {
  const bundle = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../client/main.lowered.js"),
    "utf8",
  );
  assert.doesNotMatch(bundle, /__toESM\(require_markdown_it/);
});
