// Plugin client bundles skip Metro, so Hermes would see raw `class` syntax and
// block-scoped `let`, which the 0.9.2 mobile Hermes evaluates wrongly. Apply the
// same Babel preset Metro applies to app code, then hand the result to the daemon.
import { build } from "esbuild";
import { transformSync } from "@babel/core";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const HOST_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-native",
  "@tanstack/react-query",
  "zod",
  "@getpaseo/plugin",
  "@getpaseo/plugin/*",
];

const bundled = await build({
  entryPoints: ["client/probe.tsx"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  mainFields: ["module", "main"],
  target: "es2020",
  jsx: "automatic",
  define: { __PROBE_BUILD__: JSON.stringify(new Date().toISOString()) },
  // ponytail: the 3.6 MB Mermaid page is a plain string; keep it out of Babel.
  external: [...HOST_MODULES, "./mermaid-html.gen.ts"],
  write: false,
  logLevel: "error",
});

const { code } = transformSync(bundled.outputFiles[0].text, {
  babelrc: false,
  configFile: false,
  filename: "probe.lowered.js",
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

writeFileSync("client/probe.lowered.js", code);
console.log(`client/probe.lowered.js ${(code.length / 1024).toFixed(0)} KB`);
