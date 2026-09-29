import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import {
  FIT_TRANSFORM,
  clampTransform,
  fitContentSize,
  isPointInsideTransformedContent,
  panContent,
  zoomContentAtPoint,
} from "./zoomable-viewport/geometry.ts";

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

// The image lightbox viewport (ported from packages/app/src/components/zoomable-viewport)
// is pure geometry. These cases mirror the app's geometry.test.ts so the port keeps the
// same fit, clamp, and focal-zoom behaviour.
const VIEWPORT = { width: 800, height: 600 };
const FITTED_CONTENT = { width: 800, height: 400 };

test("viewport fits content inside the viewport without changing its aspect ratio", () => {
  assert.deepEqual(fitContentSize({ width: 1600, height: 800 }, VIEWPORT), FITTED_CONTENT);
  assert.deepEqual(fitContentSize({ width: 400, height: 800 }, VIEWPORT), {
    width: 300,
    height: 600,
  });
});

test("viewport fits within presentation padding and caps", () => {
  assert.deepEqual(
    fitContentSize({ width: 1600, height: 800 }, VIEWPORT, {
      padding: 20,
      maxWidth: 600,
      maxHeight: 500,
    }),
    { width: 600, height: 300 },
  );
});

test("viewport tells backdrop taps from taps on transformed content", () => {
  assert.equal(
    isPointInsideTransformedContent({
      point: { x: 400, y: 300 },
      transform: FIT_TRANSFORM,
      fittedContent: FITTED_CONTENT,
      viewport: VIEWPORT,
    }),
    true,
  );
  assert.equal(
    isPointInsideTransformedContent({
      point: { x: 400, y: 50 },
      transform: FIT_TRANSFORM,
      fittedContent: FITTED_CONTENT,
      viewport: VIEWPORT,
    }),
    false,
  );
  assert.equal(
    isPointInsideTransformedContent({
      point: { x: 10, y: 10 },
      transform: { scale: 2, x: 0, y: 0 },
      fittedContent: FITTED_CONTENT,
      viewport: VIEWPORT,
    }),
    true,
  );
});

test("viewport returns to the centered fit transform at the minimum scale", () => {
  assert.deepEqual(
    clampTransform({ scale: 0.5, x: 200, y: -200 }, FITTED_CONTENT, VIEWPORT, {
      minScale: 1,
      maxScale: 8,
    }),
    FIT_TRANSFORM,
  );
});

test("viewport keeps the focal content point under the finger while zooming", () => {
  assert.deepEqual(
    zoomContentAtPoint({
      transform: FIT_TRANSFORM,
      scale: 2,
      focalPoint: { x: 600, y: 300 },
      fittedContent: FITTED_CONTENT,
      viewport: VIEWPORT,
      limits: { minScale: 1, maxScale: 8 },
    }),
    { scale: 2, x: -200, y: 0 },
  );
});

test("viewport clamps panning to the scaled content edges", () => {
  assert.deepEqual(
    panContent({
      transform: { scale: 2, x: 0, y: 0 },
      delta: { x: 900, y: -900 },
      fittedContent: FITTED_CONTENT,
      viewport: VIEWPORT,
      limits: { minScale: 1, maxScale: 8 },
    }),
    { scale: 2, x: 400, y: -100 },
  );
});

test("viewport stays centered when it zooms out below fit", () => {
  assert.deepEqual(
    clampTransform({ scale: 0.25, x: 100, y: 100 }, FITTED_CONTENT, VIEWPORT, {
      minScale: 0.25,
      maxScale: 8,
    }),
    { scale: 0.25, x: 0, y: 0 },
  );
});
