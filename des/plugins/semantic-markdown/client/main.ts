// Everything the entry needs, bundled and Babel-lowered by build.mjs into main.lowered.js.
//
// The API is handed over on a global, not through module exports: on 0.9.2 mobile Hermes
// every export copied through esbuild's CommonJS interop arrived as an object (seen on
// Des's phone 2026-09-27, including a string export). A plain property read avoids it.
import { SemanticMarkdown as Renderer } from "./semantic-markdown.tsx";
import { describeError, PLUGIN_BUILD, withDebug } from "./debug.tsx";
import { loadStoredSettings } from "./app-settings.ts";
import { diagnoseParse, parseSpike, spikeDataSchema } from "../shared/spike.ts";

const api = {
  SemanticMarkdown: withDebug(Renderer),
  describeError,
  diagnoseParse,
  loadStoredSettings,
  parseSpike,
  PLUGIN_BUILD,
  spikeDataSchema,
};

(globalThis as { __paseoSemanticMarkdown__?: typeof api }).__paseoSemanticMarkdown__ = api;
