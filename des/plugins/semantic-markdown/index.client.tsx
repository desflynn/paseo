import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import * as HostReact from "react";
import { Text } from "react-native";
import { z } from "zod";
import { hasSemanticSourceSyntax } from "./shared/source-syntax.ts";

type Main = import("./client/main.lowered.js").SemanticMarkdownApi;

// Red LOAD/SETUP/PARSE cards keep tagged messages owned by this plugin when it fails.
// Keep in step with client/debug.tsx.
var PLUGIN_DEBUG = false;

// Debug until stable (Des, 2026-09-27): load the lowered bundle inside try/catch so a
// module-evaluation failure shows on the card instead of failing the whole plugin.
// esbuild turns this require() into a lazy, synchronous module init.
// This file is compiled by the daemon without Babel: no classes, no block-scoped loops.
let main: Main | null = null;
let loadError: string | null = null;
try {
  // oxlint-disable-next-line import/no-unassigned-import
  require("./client/main.lowered.js");
  main = (globalThis as { __paseoSemanticMarkdown__?: Main }).__paseoSemanticMarkdown__ ?? null;
  if (!main) throw new Error("main.lowered.js ran but did not set __paseoSemanticMarkdown__");
} catch (error) {
  loadError =
    error instanceof Error
      ? error.message +
        "\n" +
        String(error.stack || "")
          .split("\n")
          .slice(0, 14)
          .join("\n")
      : String(error);
  // Debug: what the host React namespace looks like after the daemon's interop.
  var R = HostReact as unknown as { memo?: unknown; default?: { memo?: unknown } };
  loadError +=
    "\n\nhost react: typeof memo=" +
    typeof R.memo +
    " · typeof default=" +
    typeof R.default +
    " · typeof default.memo=" +
    typeof (R.default && R.default.memo) +
    "\nkeys: " +
    Object.getOwnPropertyNames(HostReact).slice(0, 12).join(", ");
  console.warn("[semantic-markdown] load failed", loadError);
}

function LoadErrorCard(props: PluginTimelineItemProps<{ text: string; error?: string }>) {
  var data = props.item.data;
  return (
    // oxlint-disable-next-line react-perf/jsx-no-new-object-as-prop
    <Text selectable style={{ color: props.theme.colors.statusDanger, fontSize: 12 }}>
      {(data.error
        ? "semantic-markdown PARSE FAILED:\n" + data.error
        : "semantic-markdown LOAD FAILED:\n" + loadError) +
        "\n\n--- original message ---\n" +
        data.text}
    </Text>
  );
}

function errorItem(text: string, error?: string) {
  var data: { text: string; error?: string } = error
    ? { text: text, error: error }
    : { text: text };
  return {
    items: [
      { type: "plugin" as const, kind: "semantic-markdown-load-error", version: 1, data: data },
    ],
  };
}

function contributeMain(client: PluginClientContext, mainApi: Main) {
  const {
    describeError,
    diagnoseParse,
    loadStoredSettings,
    parseSpike,
    PLUGIN_BUILD,
    SemanticMarkdown,
    spikeDataSchema,
  } = mainApi;
  loadStoredSettings();

  client.addTimelineTransformer({
    id: "semantic-markdown",
    query: { itemType: "assistant_message" },
    transform: ({ item, phase }) => {
      // Debug until stable: a parser failure leaves the message on Paseo's renderer.
      let data;
      try {
        data = parseSpike(item.text, phase === "streaming");
      } catch (error) {
        console.warn("[semantic-markdown] parse failed", error);
        if (!PLUGIN_DEBUG) return;
        return errorItem(item.text, "build " + PLUGIN_BUILD + "\n" + describeError(error));
      }
      if (!data) {
        // Debug until stable: our syntax present but nothing claimed — show why.
        if (!PLUGIN_DEBUG || !hasSemanticSourceSyntax(item.text)) return;
        var why;
        try {
          why = diagnoseParse(item.text);
        } catch (error) {
          why = "diagnoseParse threw: " + describeError(error);
        }
        return errorItem(item.text, "PARSE NULL (build " + PLUGIN_BUILD + ")\n" + why);
      }
      return {
        items: [{ type: "plugin", kind: "semantic-markdown", version: 1, data }],
      };
    },
  });

  client.addTimelineRenderer({
    kind: "semantic-markdown",
    version: 1,
    schema: spikeDataSchema,
    Component: SemanticMarkdown,
  });

  return () => {};
}

// Any failure in setup is caught. With PLUGIN_DEBUG it shows the error card with the
// stack and the type of every export from the lowered bundle; without it Paseo renders.
export default function contribute(client: PluginClientContext) {
  client.addTimelineRenderer({
    kind: "semantic-markdown-load-error",
    version: 1,
    schema: z.object({ text: z.string(), error: z.string().optional() }),
    Component: LoadErrorCard,
  });
  if (main) {
    try {
      return contributeMain(client, main);
    } catch (error) {
      var m = main as unknown as Record<string, unknown>;
      loadError =
        "SETUP FAILED:\n" +
        (error instanceof Error
          ? error.message +
            "\n" +
            String(error.stack || "")
              .split("\n")
              .slice(0, 10)
              .join("\n")
          : String(error)) +
        "\n\nmain exports: " +
        Object.keys(m)
          .map(function (k) {
            return k + "=" + typeof m[k];
          })
          .join(", ");
    }
  }
  if (!PLUGIN_DEBUG) return () => {};
  client.addTimelineTransformer({
    id: "semantic-markdown-fallback",
    query: { itemType: "assistant_message" },
    transform: ({ item }) =>
      hasSemanticSourceSyntax(item.text) ? errorItem(item.text) : undefined,
  });
  return () => {};
}
