import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createSemanticMarkdownParser, parseSpike } from "./shared/spike.ts";

function tokenTypes(text: string) {
  const tokens = createSemanticMarkdownParser().parse(text, {});
  return tokens.flatMap((token) => [token].concat(token.children ?? []));
}

test("ordinary Markdown stays native", () => {
  assert.equal(parseSpike("**Just** a normal answer."), undefined);
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

test("all semantic kinds work in all three treatments", () => {
  for (const kind of ["ask", "done", "deferred", "warning", "danger", "info"]) {
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

test("incomplete and unknown markers stay native", () => {
  assert.equal(parseSpike("{done"), undefined);
  assert.equal(parseSpike("=={warning}no close"), undefined);
  assert.equal(parseSpike("{nope} text"), undefined);
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
