import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createAssistantMarkdownParser } from "./client/vendor/utils/assistant-markdown-parser.ts";
import { hasSemanticSourceSyntax } from "./shared/source-syntax.ts";
import {
  applySemanticRules,
  createSemanticMarkdownParser,
  parseSemanticMarkdown,
  parseSpike,
  semanticKinds,
} from "./shared/spike.ts";

function tokenTypes(text: string) {
  const tokens = parseSemanticMarkdown(createSemanticMarkdownParser(), text);
  return tokens.flatMap((token) => [token].concat(token.children ?? []));
}

interface TokenLike {
  type: string;
  content: string;
  block?: boolean;
  meta?: Record<string, unknown> | null;
  children?: TokenLike[] | null;
}

function parseBlocks(text: string) {
  return createSemanticMarkdownParser().parse(text, {});
}

function collectInlineChildren(tokens: readonly TokenLike[]): TokenLike[] {
  const collected: TokenLike[] = [];
  for (const token of tokens) {
    if (token.type === "inline") collected.push(...(token.children ?? []));
    collected.push(...collectInlineChildren(token.children ?? []));
  }
  return collected;
}

function tableColumnFlexes(text: string): number[][] {
  const rows: number[][] = [];
  let row: number[] | null = null;
  for (const token of parseSemanticMarkdown(createSemanticMarkdownParser(), text)) {
    if (token.type === "tr_open") row = [];
    if ((token.type === "th_open" || token.type === "td_open") && row) {
      row.push(Number(token.attrGet("data-semantic-flex")));
    }
    if (token.type === "tr_close" && row) {
      rows.push(row);
      row = null;
    }
  }
  return rows;
}

test("ordinary Markdown stays native", () => {
  assert.equal(parseSpike("**Just** a normal answer."), undefined);
});

test("ownership claims semantic markup, tables, fences, and blockquotes", () => {
  const claimed = [
    "{done} active",
    "| ID | Name |\n| --- | --- |\n| 1 | Ada |",
    "| ID |\n| --- |\n| 1 |",
    "```ts\nconst value = 1;\n```",
    "```mermaid\ngraph TD; A-->B;\n```",
    "> A plain quoted line.",
  ];
  for (const text of claimed) {
    assert.notEqual(parseSpike(text), undefined, `parseSpike should claim: ${text}`);
    assert.equal(hasSemanticSourceSyntax(text), true, `detector should claim: ${text}`);
  }
});

test("ownership leaves prose, headings, lists, emphasis, links, and inline code native", () => {
  const native = [
    "**Just** a normal answer.",
    "# Heading\n\nA paragraph of ordinary prose.",
    "- one\n- two",
    "1. first\n2. second",
    "[docs](https://example.com)",
    "Use `inline` code.",
    "A sentence with a | pipe is not a table.",
  ];
  for (const text of native) {
    assert.equal(parseSpike(text), undefined, `parseSpike should not claim: ${text}`);
    assert.equal(hasSemanticSourceSyntax(text), false, `detector should not claim: ${text}`);
  }
});

test("ownership claims agent deep links so the plugin can route them in-app", () => {
  const claimed = [
    "[Open Pi Fixer Guy](agent:d11bb301-7d39-4239-9dd7-c3bc3799faf5)",
    "[Open Pi Fixer Guy](paseo://h/srv_abc123/agent/d11bb301-7d39-4239-9dd7-c3bc3799faf5)",
    "Plain prose, then [a link](agent:d11bb301-7d39-4239-9dd7-c3bc3799faf5) mid-sentence.",
  ];
  for (const text of claimed) {
    assert.notEqual(parseSpike(text), undefined, `parseSpike should claim: ${text}`);
  }
});

test("ownership still leaves non-agent links native", () => {
  const native = [
    "[docs](https://example.com)",
    "[agent-ish](agent:not-a-uuid)",
    "[workspace file](file:///repo/README.md)",
  ];
  for (const text of native) {
    assert.equal(parseSpike(text), undefined, `parseSpike should not claim: ${text}`);
  }
});

test("plain semantic lines preserve nested Markdown", () => {
  const text = "{done} **Desktop build complete.** Version 0.9.2.";
  assert.deepEqual(parseSpike(text), { text });

  const tokens = tokenTypes(text);
  assert.equal(tokens.find((token) => token.type === "semantic_text_open")?.meta?.kind, "done");
  assert.ok(tokens.some((token) => token.type === "strong_open"));
});

test("inline highlights preserve nested Markdown", () => {
  const text = "Review =={warning}the **npm lockfile**== before committing.";
  const tokens = tokenTypes(text);

  assert.equal(
    tokens.find((token) => token.type === "semantic_highlight_open")?.meta?.kind,
    "warning",
  );
  assert.ok(tokens.some((token) => token.type === "strong_open"));
});

test("callout cards preserve nested Markdown", () => {
  const text = "> [!danger]\n> **Do not restart the daemon.** Active agents would stop.";
  const tokens = tokenTypes(text);

  assert.equal(
    tokens.find((token) => token.type === "semantic_callout_open")?.meta?.kind,
    "danger",
  );
  assert.ok(tokens.some((token) => token.type === "strong_open"));
});

test("table cells resolve earlier named full-Markdown card definitions", () => {
  const text = [
    "{card:release}",
    "> [!ask] Release decisions",
    "> | Question | Outcomes |",
    "> | --- | --- |",
    "> | {ask}==**Question 1.**\\ **Ship now?**=={/ask} | {ask}==**A. Ship**=={/ask} OR {muted}B. Hold{/muted} |",
    "{/card}",
    "",
    "| Container | Report |",
    "| --- | --- |",
    "| Release | {card:release} |",
  ].join("\n");

  assert.deepEqual(parseSpike(text), { text });
  const tokens = tokenTypes(text);
  const reference = tokens.find((token) => token.type === "semantic_card_ref");
  assert.equal(reference?.meta?.id, "release");
  assert.equal(typeof reference?.meta?.source, "string");
  assert.equal(tokens.filter((token) => token.type === "table_open").length, 1);
  assert.ok(
    tokens
      .filter((token) => token.type === "text")
      .every((token) => !token.content.includes("{card:release}")),
  );

  const cardTokens = tokenTypes(String(reference?.meta?.source));
  assert.ok(cardTokens.some((token) => token.type === "semantic_callout_open"));
  assert.ok(cardTokens.some((token) => token.type === "table_open"));
  assert.ok(cardTokens.some((token) => token.type === "semantic_highlight_open"));
  assert.ok(cardTokens.some((token) => token.type === "semantic_inline_open"));
});

test("missing and unclosed card references stay literal", () => {
  const missing = "| Report |\n| --- |\n| {card:missing} |";
  assert.deepEqual(parseSpike(missing), { text: missing });
  assert.ok(
    tokenTypes(missing).some(
      (token) => token.type === "text" && token.content === "{card:missing}",
    ),
  );
  const unclosed = tokenTypes("{card:open}\n> [!ask] Still source");
  assert.ok(unclosed.some((token) => token.type === "semantic_callout_open"));
  assert.ok(unclosed.some((token) => token.type === "text" && token.content === "{card:open}"));
});

test("complete card definitions stay hidden before a reference arrives", () => {
  const text = "{card:later}\nPlain prepared body.\n{/card}";
  assert.equal(parseSpike(text), undefined);
  assert.deepEqual(tokenTypes(text), []);
});

test("table columns stay equal when their visible content is similar", () => {
  assert.deepEqual(tableColumnFlexes("| First | Second |\n| --- | --- |\n| alpha | bravo |"), [
    [0.5, 0.5],
    [0.5, 0.5],
  ]);
});

test("two-column tables clamp strong content imbalance to 30/70", () => {
  const rows = tableColumnFlexes(
    "| ID | Explanation |\n| --- | --- |\n| 1 | This explanation contains enough visible prose to dominate the short identifier column by a wide margin. |",
  );
  assert.deepEqual(rows, [
    [0.3, 0.7],
    [0.3, 0.7],
  ]);
});

test("four-column tables keep ordinary columns between 15% and 45%", () => {
  const rows = tableColumnFlexes(
    "| Step | State | Question | Outcome |\n| --- | --- | --- | --- |\n| One | Open | Ship? | This outcome contains substantially more visible explanatory content than every other column. |",
  );
  for (const row of rows) {
    assert.equal(Math.round(row.reduce((sum, value) => sum + value, 0) * 1000), 1000);
    assert.ok(row.every((value) => value >= 0.15 && value <= 0.45));
    assert.ok(row[3] > row[0]);
  }
});

test("four-column tables let a tiny identifier column shrink below the floor", () => {
  const rows = tableColumnFlexes(
    "| ID | State | Question | Outcome |\n| --- | --- | --- | --- |\n| 1 | Open | Ship? | This outcome contains substantially more visible explanatory content than every other column. |",
  );
  for (const row of rows) {
    assert.equal(Math.round(row.reduce((sum, value) => sum + value, 0) * 1000), 1000);
    assert.ok(row[0] < 0.15, `identifier column kept flex ${row[0]}`);
    assert.ok(
      row.slice(1).every((value) => value >= 0.15 && value <= 0.45),
      `ordinary columns drifted: ${row.join(", ")}`,
    );
  }
});

test("identifier relief follows visible width, not the header name", () => {
  const wideIdentifier = tableColumnFlexes(
    "| ID | State | Question | Outcome |\n| --- | --- | --- | --- |\n| ID-20260928-001 | Open | Ship? | This outcome contains substantially more visible explanatory content than every other column. |",
  );
  for (const row of wideIdentifier) {
    assert.ok(row[0] >= 0.15, `wide identifier got flex ${row[0]}`);
  }

  const numericHeader = tableColumnFlexes(
    "| # | State | Question | Outcome |\n| --- | --- | --- | --- |\n| 1 | Open | Ship? | This outcome contains substantially more visible explanatory content than every other column. |",
  );
  for (const row of numericHeader) {
    assert.ok(row[0] < 0.15, `tiny numeric identifier got flex ${row[0]}`);
  }
});

test("fallback detection recognizes complete named card references", () => {
  const text = "| Report |\n| --- |\n| {card:x} |\n\n{card:x}\nPlain card body.\n{/card}";
  assert.equal(hasSemanticSourceSyntax(text), true);
});

test("all semantic kinds work in all three treatments", () => {
  for (const kind of ["ask", "done", "deferred", "warning", "danger", "info", "muted"]) {
    assert.ok(tokenTypes(`{${kind}} plain`).some((token) => token.type === "semantic_text_open"));
    assert.ok(
      tokenTypes(`=={${kind}} highlight==`).some(
        (token) => token.type === "semantic_highlight_open",
      ),
    );
    assert.ok(
      tokenTypes(`> [!${kind}]\n> card`).some((token) => token.type === "semantic_callout_open"),
    );
  }
});

test("semantic examples inside code stay literal", () => {
  const tokens = tokenTypes("`{done} literal`\n\n```md\n> [!danger]\n```");
  assert.ok(tokens.every((token) => !token.type.startsWith("semantic_")));
});

test("fallback detection claims fenced code but ignores inline code", () => {
  assert.equal(hasSemanticSourceSyntax("{done} active"), true);
  assert.equal(hasSemanticSourceSyntax("Discuss `{done}` here"), false);
  assert.equal(hasSemanticSourceSyntax("```md\n{done} example\n```"), true);
});

test("fallback detection ignores unsupported wrapper kinds", () => {
  const prose =
    "{success}==Implementation complete.=={/success} or {warn}==Hold the change.=={/warn}";
  assert.equal(hasSemanticSourceSyntax(prose), false);
});

test("fallback detection recognizes paired tags and wrapped highlights", () => {
  assert.equal(hasSemanticSourceSyntax("Pick {muted}the cheaper host{/muted} now."), true);
  assert.equal(hasSemanticSourceSyntax("{ask}Ship the staged build?{/ask}"), true);
  assert.equal(hasSemanticSourceSyntax("{ask}==Ask 1.=={/ask}"), true);
  assert.equal(hasSemanticSourceSyntax("{success}==done=={/success}"), false);
});

test("a conversational ask styles spans while labels and addenda stay plain", () => {
  const text =
    "{ask}==Ask 1.=={/ask} {ask}==A. Commit and push=={/ask} after the diff check OR {muted}B. Commit locally only{/muted} for review OR {muted}C. Leave it uncommitted{/muted} until later. I will continue after.";
  const children = collectInlineChildren(parseBlocks(text));

  assert.deepEqual(
    children
      .filter((token) => token.type === "semantic_highlight_open")
      .map((token) => token.meta?.kind),
    ["ask", "ask"],
  );
  assert.deepEqual(
    children
      .filter((token) => token.type === "semantic_inline_open")
      .map((token) => token.meta?.kind),
    ["muted", "muted"],
  );
  const textContent = children
    .filter((token) => token.type === "text")
    .map((token) => token.content)
    .join("");
  assert.ok(textContent.includes("after the diff check OR"));
  assert.ok(textContent.includes("for review OR"));
  assert.ok(children.some((token) => token.type === "text" && token.content.endsWith("after.")));
});

test("escaped spaces get out of highlights in both syntaxes", () => {
  for (const text of [
    "{ask}==Ask 1.\\ A. Commit and push=={/ask}",
    "=={ask}Ask 1.\\ A. Commit and push==",
  ]) {
    const children = collectInlineChildren(parseBlocks(text));
    assert.deepEqual(
      children.map((token) => token.type),
      [
        "semantic_highlight_open",
        "text",
        "semantic_highlight_close",
        "text",
        "semantic_highlight_open",
        "text",
        "semantic_highlight_close",
      ],
    );
    assert.equal(children[3].content, " ");
    assert.equal(
      children
        .filter((token) => token.type === "text")
        .map((token) => token.content)
        .join(""),
      "Ask 1. A. Commit and push",
    );
  }
});

test("backslashes escape every semantic kind and highlight form", () => {
  for (const kind of semanticKinds) {
    for (const text of [
      `\\{${kind}} plain`,
      `\\{${kind}}paired\\{/${kind}}`,
      `{${kind}}paired\\{/${kind}}`,
      `\\=={${kind}}highlight==`,
      `=={${kind}}highlight\\==`,
      `\\{${kind}}==wrapped==\\{/${kind}}`,
    ]) {
      assert.ok(
        tokenTypes(text).every((token) => !token.type.startsWith("semantic_")),
        `semantic token leaked from: ${text}`,
      );
      assert.equal(hasSemanticSourceSyntax(text), false, `detector claimed: ${text}`);
    }
  }
});

test("backslashes escape callouts, card definitions, and card references", () => {
  const callout = tokenTypes("> \\[!ask] Literal callout marker");
  assert.ok(callout.every((token) => token.type !== "semantic_callout_open"));
  assert.ok(callout.some((token) => token.type === "text" && token.content.includes("[!ask]")));

  const definition = "\\{card:release}\nPlain body.\n\\{/card}";
  assert.equal(hasSemanticSourceSyntax(definition), false);

  const reference = [
    "{card:release}",
    "> [!ask] Hidden card",
    "{/card}",
    "",
    "| Report |",
    "| --- |",
    "| \\{card:release} |",
  ].join("\n");
  const referenceTokens = tokenTypes(reference);
  assert.ok(referenceTokens.every((token) => token.type !== "semantic_card_ref"));
  assert.ok(
    referenceTokens.some((token) => token.type === "text" && token.content === "{card:release}"),
  );
});

test("escaped closers and highlight markers stay inside their outer span", () => {
  const paired = collectInlineChildren(parseBlocks("{ask}before \\{/ask} after{/ask}"));
  assert.equal(paired.filter((token) => token.type === "semantic_inline_open").length, 1);
  assert.equal(
    paired
      .filter((token) => token.type === "text")
      .map((token) => token.content)
      .join(""),
    "before {/ask} after",
  );

  for (const text of ["=={ask}before \\== after==", "{ask}==before \\== after=={/ask}"]) {
    const highlighted = collectInlineChildren(parseBlocks(text));
    assert.equal(highlighted.filter((token) => token.type === "semantic_highlight_open").length, 1);
    assert.equal(
      highlighted
        .filter((token) => token.type === "text")
        .map((token) => token.content)
        .join(""),
      "before == after",
    );
  }
});

test("escaped semantic code stays literal inside an outer highlight", () => {
  const text = "{ask}==**A. One plain line with an inline `\\{danger}` tag, then the ask**=={/ask}";
  const children = collectInlineChildren(parseBlocks(text));

  assert.deepEqual(
    children
      .filter((token) => token.type === "semantic_highlight_open")
      .map((token) => token.meta?.kind),
    ["ask"],
  );
  assert.ok(children.every((token) => token.type !== "semantic_inline_open"));
  assert.equal(children.find((token) => token.type === "code_inline")?.content, "{danger}");
});

test("escaped semantic code stays literal inside semantic block forms", () => {
  for (const text of [
    "{done} One line with `\\{danger}` code",
    "> [!info] Card\n> One line with `\\{danger}` code",
  ]) {
    assert.equal(
      tokenTypes(text).find((token) => token.type === "code_inline")?.content,
      "{danger}",
    );
  }
});

test("paired tags stay inline in a paragraph", () => {
  const text = "Pick {muted}the cheaper host{/muted} if latency is fine.";
  const blocks = parseBlocks(text);
  assert.deepEqual(
    blocks.map((token) => token.type),
    ["paragraph_open", "inline", "paragraph_close"],
  );

  const children = blocks.find((token) => token.type === "inline")?.children ?? [];
  assert.deepEqual(
    children.map((token) => token.type),
    ["text", "semantic_inline_open", "text", "semantic_inline_close", "text"],
  );
  assert.equal(children[1].meta?.kind, "muted");
  assert.equal(children[3].content, "");
  assert.ok(children.every((token) => token.block !== true));
  assert.ok(children.every((token) => !token.content.includes("\n")));
});

test("paired tags inside one ask bullet stay inline", () => {
  const text = "- {ask}Ship the staged build?{/ask} Answer by 15:00.";
  const blocks = parseBlocks(text);
  assert.deepEqual(
    blocks.map((token) => token.type),
    [
      "bullet_list_open",
      "list_item_open",
      "paragraph_open",
      "inline",
      "paragraph_close",
      "list_item_close",
      "bullet_list_close",
    ],
  );

  const inline = blocks.find((token) => token.type === "inline");
  const children = inline?.children ?? [];
  assert.deepEqual(
    children.map((token) => token.type),
    ["semantic_inline_open", "text", "semantic_inline_close", "text"],
  );
  assert.equal(children[0].meta?.kind, "ask");
  assert.equal(children[2].content, "");
  assert.ok(children.every((token) => token.block !== true));
});

test("nested option bullets keep paired tags inline and leave separators as prose", () => {
  const text = [
    "- {ask}Which build should we ship?{/ask}",
    "  - {done}A. Staged build{/done}",
    "  - {muted}B. Local build{/muted}",
    "  - {muted}C. Nightly build{/muted}",
    "  - {deferred}D. Wait for CI{/deferred}",
    "",
    "or",
    "",
    "- {muted}E. Skip this week{/muted}",
  ].join("\n");

  const blocks = parseBlocks(text);
  assert.ok(blocks.every((token) => !token.type.startsWith("semantic_")));

  const children = collectInlineChildren(blocks);
  const opens = children.filter((token) => token.type === "semantic_inline_open");
  const closes = children.filter((token) => token.type === "semantic_inline_close");
  assert.deepEqual(
    opens.map((token) => token.meta?.kind),
    ["ask", "done", "muted", "muted", "deferred", "muted"],
  );
  assert.equal(closes.length, opens.length);
  assert.ok(
    children
      .filter((token) => token.type.startsWith("semantic_inline"))
      .every((token) => token.block !== true && token.content === ""),
  );

  // "or" is prose guidance: it stays a lone text token, never parser behavior.
  const separator = blocks.find((token) => token.type === "inline" && token.content === "or");
  assert.ok(separator);
  assert.deepEqual(
    separator.children?.map((token) => token.type),
    ["text"],
  );

  assert.equal(hasSemanticSourceSyntax(text), true);
});

test("paired tags do not nest", () => {
  const text = "{ask}Pick {done}this{/done} now{/ask}";
  const children = parseBlocks(text).find((token) => token.type === "inline")?.children ?? [];
  assert.deepEqual(
    children
      .filter((token) => token.type === "semantic_inline_open")
      .map((token) => token.meta?.kind),
    ["done"],
  );
  assert.equal(children.filter((token) => token.type === "semantic_inline_close").length, 1);
});

test("paired tags parse ordinary Markdown inside", () => {
  const text = "{warning}Review the **npm lockfile** change{/warning} before committing.";
  const children = parseBlocks(text).find((token) => token.type === "inline")?.children ?? [];
  assert.ok(children.some((token) => token.type === "strong_open"));
});

test("all semantic kinds work as paired inline tags", () => {
  for (const kind of semanticKinds) {
    const children =
      parseBlocks(`Pick {${kind}}x{/${kind}} now.`).find((token) => token.type === "inline")
        ?.children ?? [];
    assert.equal(children.find((token) => token.type === "semantic_inline_open")?.meta?.kind, kind);
    assert.ok(children.some((token) => token.type === "semantic_inline_close"));
  }
});

test("incomplete and unknown markers stay native", () => {
  assert.equal(parseSpike("{done"), undefined);
  assert.equal(parseSpike("=={warning}no close"), undefined);
  assert.equal(parseSpike("{nope} text"), undefined);
});

test("streaming paired tags wait for their closing tag", () => {
  const partial = "Before {done}==**Build complete.**";
  assert.equal(parseSpike(partial), undefined);
  assert.deepEqual(parseSpike(partial, true), { text: partial });

  const parser = applySemanticRules(createAssistantMarkdownParser({ streaming: true }), true);
  const partialChildren = collectInlineChildren(parser.parse(partial, {}));
  assert.equal(
    partialChildren
      .filter((token) => token.type === "text")
      .map((token) => token.content)
      .join(""),
    "Before ",
  );
  assert.ok(partialChildren.every((token) => !token.content.includes("{done}")));

  const complete = "Before {done}==**Build complete.**=={/done}";
  const completeChildren = collectInlineChildren(parser.parse(complete, {}));
  assert.ok(completeChildren.some((token) => token.type === "semantic_highlight_open"));
  assert.ok(completeChildren.some((token) => token.type === "strong_open"));
});

test("desktop can load the native WebView adapter without native commands", async () => {
  const result = await build({
    entryPoints: ["client/vendor/components/markdown/fence/mermaid/native-webview.tsx"],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    plugins: [
      {
        name: "desktop-host-stubs",
        setup(context) {
          context.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
          context.onResolve({ filter: /^react-native$/ }, () => ({
            path: "react-native",
            namespace: "stub",
          }));
          context.onLoad({ filter: /^react$/, namespace: "stub" }, () => ({
            contents:
              "export const createElement = () => null; export const forwardRef = (value) => value; export const memo = (value) => value;",
            loader: "js",
          }));
          context.onLoad({ filter: /^react-native$/, namespace: "stub" }, () => ({
            contents: "export const codegenNativeCommands = undefined;",
            loader: "js",
          }));
        },
      },
    ],
  });

  assert.doesNotThrow(() =>
    vm.runInNewContext(result.outputFiles[0].text, { exports: {}, module: {} }),
  );
});

test("claimComplete claims a plain finished message but not a streaming one", () => {
  const text = "**Just** a normal answer.";
  assert.deepEqual(parseSpike(text, false, { claimComplete: true }), { text });
  assert.equal(parseSpike(text, true, { claimComplete: true }), undefined);
});
