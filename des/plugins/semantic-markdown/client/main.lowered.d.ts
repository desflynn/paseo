// Hand-written on purpose: re-exporting from ./main.ts would lead the daemon's
// boundary check through the type graph into the source, including markdown-it's
// Node-only punycode import. Keep in step with client/main.ts.
import type { ComponentType } from "react";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { ZodType } from "zod";
import type { PluginTimelineData } from "@getpaseo/plugin";

// ponytail: loose data type; the zod schema validates renderer data at runtime.
type SpikeData = PluginTimelineData;

declare const SemanticMarkdown: ComponentType<PluginTimelineItemProps<SpikeData>>;
declare const PLUGIN_BUILD: string;
declare function describeError(error: unknown): string;
declare function loadStoredSettings(): void;
declare function diagnoseParse(text: string): string;
declare function parseSpike(text: string): SpikeData | null;
declare const spikeDataSchema: ZodType<SpikeData>;

/** Set on globalThis by main.lowered.js when it runs (see client/main.ts). */
export interface SemanticMarkdownApi {
  SemanticMarkdown: typeof SemanticMarkdown;
  PLUGIN_BUILD: typeof PLUGIN_BUILD;
  describeError: typeof describeError;
  diagnoseParse: typeof diagnoseParse;
  loadStoredSettings: typeof loadStoredSettings;
  parseSpike: typeof parseSpike;
  spikeDataSchema: typeof spikeDataSchema;
}
