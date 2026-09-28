import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

// Desktop regression: react-native-web applies its notSelectable style
// (user-select:none) after the style prop whenever selectable is false, which
// clamps drag selection to a single span. The web variant must leave the prop
// unset so the markdown styles' userSelect:text spans the whole message.
interface SpanRenderer {
  (props: { children: null; copyTag: string }): { props: { selectable?: boolean } };
}

async function loadSpanRenderer(isWebSurface: boolean): Promise<SpanRenderer> {
  const result = await build({
    entryPoints: ["client/vendor/components/markdown-text.tsx"],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    jsx: "automatic",
    plugins: [
      {
        name: "component-stubs",
        setup(context) {
          const stub = (filter: RegExp, path: string) =>
            context.onResolve({ filter }, () => ({ path, namespace: "stub" }));
          stub(/^react$/, "react");
          stub(/^react\/jsx-runtime$/, "jsx-runtime");
          stub(/^react-native$/, "react-native");
          stub(/constants\/platform/, "platform");
          stub(/code-surface/, "code-surface");
          stub(/assistant-selection-copy\/markup/, "markup");
          context.onLoad({ filter: /^react$/, namespace: "stub" }, () => ({
            contents: "export const useMemo = (compute) => compute();",
            loader: "js",
          }));
          context.onLoad({ filter: /^jsx-runtime$/, namespace: "stub" }, () => ({
            contents:
              "export const jsx = (type, props) => ({ type, props });\nexport const jsxs = jsx;",
            loader: "js",
          }));
          context.onLoad({ filter: /^react-native$/, namespace: "stub" }, () => ({
            contents:
              "export const Text = (props) => ({ type: 'Text', props });\nexport const View = (props) => ({ type: 'View', props });",
            loader: "js",
          }));
          context.onLoad({ filter: /^platform$/, namespace: "stub" }, () => ({
            contents: `export const isWeb = ${isWebSurface};`,
            loader: "js",
          }));
          context.onLoad({ filter: /^code-surface$/, namespace: "stub" }, () => ({
            contents: "export const CODE_SURFACE_DATASET = {};",
            loader: "js",
          }));
          context.onLoad({ filter: /^markup$/, namespace: "stub" }, () => ({
            contents: "export const markdownCopyDataSet = { p: {} };",
            loader: "js",
          }));
        },
      },
    ],
  });

  const sandbox: { module: { exports: Record<string, unknown> } } = {
    module: { exports: {} },
  };
  vm.runInNewContext(result.outputFiles[0].text, sandbox);
  return sandbox.module.exports.MarkdownTextSpan as SpanRenderer;
}

test("web span omits selectable so drag selection crosses the whole message", async () => {
  const MarkdownTextSpan = await loadSpanRenderer(true);
  const element = MarkdownTextSpan({ children: null, copyTag: "p" });
  assert.equal(element.props.selectable, undefined);
});

test("native span keeps per-line selectable text", async () => {
  const MarkdownTextSpan = await loadSpanRenderer(false);
  const element = MarkdownTextSpan({ children: null, copyTag: "p" });
  assert.equal(element.props.selectable, true);
});
