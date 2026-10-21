import type { PluginClientContext } from "@getpaseo/plugin/client";
import { z } from "zod";
import { RenderProbe } from "./client/probe.lowered.js";

export default function contribute(client: PluginClientContext) {
  client.addTimelineTransformer({
    id: "render-probe",
    query: { itemType: "assistant_message" },
    transform: ({ item }) =>
      item.text.includes("{render-probe}")
        ? { items: [{ type: "plugin", kind: "render-probe", version: 1, data: {} }] }
        : undefined,
  });

  client.addTimelineRenderer({
    kind: "render-probe",
    version: 1,
    schema: z.object({}),
    Component: RenderProbe,
  });

  return () => {};
}
