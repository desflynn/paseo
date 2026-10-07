import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Preview } from "./client/preview";
import { ToolCallRow } from "./client/tool-row";
import {
  TOOL_ROW_KIND,
  TOOL_ROW_VERSION,
  toolRowDataSchema,
  transformToolCallItem,
} from "./shared/tool-call";

export default function contribute(client: PluginClientContext) {
  const removeSurface = client.addSurface("preview", Preview);
  const removeSidebar = client.addSidebarItem({
    id: "preview",
    title: "Tool results spike",
    icon: "Table",
    surface: "preview",
  });
  // Claims unknown-detail tool_call rows only; specialized rows stay host-rendered.
  // Host overview grouping is not retained for claimed rows — per-row parity only.
  const removeTransformer = client.addTimelineTransformer({
    id: "tool-results-spike-tool-call",
    query: { itemType: "tool_call" },
    transform: ({ item }) => transformToolCallItem(item),
  });
  const removeRenderer = client.addTimelineRenderer({
    kind: TOOL_ROW_KIND,
    version: TOOL_ROW_VERSION,
    schema: toolRowDataSchema,
    Component: ToolCallRow,
  });
  return () => {
    removeSidebar();
    removeSurface();
    removeTransformer();
    removeRenderer();
  };
}
