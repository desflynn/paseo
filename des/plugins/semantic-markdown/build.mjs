// Plugin client bundles skip Metro, so Hermes would see raw `class` syntax and
// block-scoped `let`, which the 0.9.2 mobile Hermes evaluates wrongly (a class
// expression evaluates to undefined). Bundle the client, apply the same Babel preset
// Metro applies to app code, and hand the result to the daemon's compiler.
import { build } from "esbuild";
import { transformSync } from "@babel/core";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));

const HOST_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  "zod",
  "@getpaseo/plugin",
  "@getpaseo/plugin/*",
];

// The app's patch makes react-native-markdown-display AST keys deterministic, so
// streaming re-renders do not remount the tree. Forward-only; no-op once applied.
function applyMarkdownDisplayPatch() {
  const patch = path.resolve(root, "../../../patches/react-native-markdown-display+7.0.2.patch");
  if (!existsSync(patch)) throw new Error(`markdown-display patch not found at ${patch}`);
  try {
    execSync(`patch -p1 -N -r /dev/null < "${patch}"`, { cwd: root, stdio: "pipe" });
  } catch (error) {
    if (!/already applied|Reversed/i.test(String(error.stdout ?? ""))) throw error;
  }
}

// markdown-display imports react-native-fit-image; the app bundle never renders it.
const fitImageShim = {
  name: "fit-image-shim",
  setup(context) {
    context.onResolve({ filter: /^react-native-fit-image$/ }, () => ({
      path: "fit-image",
      namespace: "fit-image-shim",
    }));
    context.onLoad({ filter: /.*/, namespace: "fit-image-shim" }, () => ({
      contents: 'export { Image as default } from "react-native";',
      loader: "js",
    }));
  },
};

// On 0.9.2 mobile the host React namespace is unreliable: its top-level `memo` is an
// object while `default.memo` is the real function (seen on Des's phone 2026-09-27).
// Route every plugin `import ... from "react"` through one module that takes React from
// the host's default export when that is the real React object, and re-exports each API
// by name. Names come from the installed react package.
const REACT_API_NAMES = Object.keys(require("react")).filter((name) =>
  /^[A-Za-z_$][\w$]*$/.test(name),
);
const reactNormalizeShim = {
  name: "react-normalize-shim",
  setup(context) {
    context.onResolve({ filter: /^react$/ }, (args) =>
      args.namespace === "react-normalized"
        ? { path: "react", external: true }
        : { path: "react", namespace: "react-normalized" },
    );
    context.onLoad({ filter: /.*/, namespace: "react-normalized" }, () => ({
      contents: [
        'import * as HostReact from "react";',
        'const React = HostReact.default && typeof HostReact.default.memo === "function" ? HostReact.default : HostReact;',
        "export default React;",
        ...REACT_API_NAMES.map((name) => `export const ${name} = React.${name};`),
      ].join("\n"),
      loader: "js",
    }));
  },
};

// markdown-it exports a bare function. esbuild's __toESM copies its own properties,
// and reading `caller`/`arguments` on a strict function throws. A require() default
// export makes esbuild call require_markdown_it() directly, with no __toESM.
const markdownItDefaultShim = {
  name: "markdown-it-default-shim",
  setup(context) {
    context.onResolve({ filter: /^markdown-it$/ }, (args) =>
      args.namespace === "markdown-it-default"
        ? undefined
        : { path: "markdown-it", namespace: "markdown-it-default" },
    );
    context.onLoad({ filter: /.*/, namespace: "markdown-it-default" }, () => ({
      contents: 'const MarkdownIt = require("markdown-it"); export default MarkdownIt;',
      resolveDir: root,
      loader: "js",
    }));
  },
};

applyMarkdownDisplayPatch();

const bundled = await build({
  entryPoints: [path.join(root, "client/main.ts")],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2020",
  jsx: "automatic",
  define: { __PLUGIN_BUILD__: JSON.stringify(new Date().toISOString()) },
  // react-native-markdown-display ships JSX in .js sources.
  loader: { ".js": "jsx" },
  external: HOST_MODULES.filter((name) => name !== "react"),
  plugins: [fitImageShim, reactNormalizeShim, markdownItDefaultShim],
  write: false,
  logLevel: "error",
});

const { code } = transformSync(bundled.outputFiles[0].text, {
  babelrc: false,
  configFile: false,
  filename: "main.lowered.js",
  compact: false,
  presets: [
    [
      require.resolve("@react-native/babel-preset"),
      // Keep ESM: the daemon's esbuild inlines a Babel CommonJS file unwrapped,
      // which sends its `exports.X` to the wrong object.
      {
        unstable_transformProfile: "hermes-stable",
        enableBabelRuntime: false,
        disableImportExportTransform: true,
      },
    ],
  ],
});

writeFileSync(path.join(root, "client/main.lowered.js"), code);
console.log(`client/main.lowered.js ${(code.length / 1024).toFixed(0)} KB`);
