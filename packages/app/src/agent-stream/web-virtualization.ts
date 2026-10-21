import type { AssistantImageContext } from "@/utils/assistant-image-metadata";
import type { PluginTimelineStreamItem, StreamItem } from "@/types/stream";
import { estimateAssistantMessageHeightFromCache } from "@/utils/assistant-message-height-estimate";
import {
  DEFAULT_MOUNTED_RECENT_STREAM_ITEMS,
  findMountedWindowStart,
  getMountedRecentStreamItems,
} from "./history-window";

export const DEFAULT_WEB_PARTIAL_VIRTUALIZATION_THRESHOLD = 100;
export const DEFAULT_WEB_MOUNTED_RECENT_STREAM_ITEMS = DEFAULT_MOUNTED_RECENT_STREAM_ITEMS;
const COLLAPSED_TOOL_SEQUENCE_ROW_HEIGHT_ESTIMATE = 40;

type BottomAnchorE2ETestGlobals = typeof globalThis & {
  __PASEO_E2E_WEB_PARTIAL_VIRTUALIZATION_THRESHOLD?: unknown;
};

function readPositiveIntegerOverride(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value as number);
  return normalized > 0 ? normalized : null;
}

export function getWebPartialVirtualizationThreshold(): number {
  const override = readPositiveIntegerOverride(
    (globalThis as BottomAnchorE2ETestGlobals).__PASEO_E2E_WEB_PARTIAL_VIRTUALIZATION_THRESHOLD,
  );
  return override ?? DEFAULT_WEB_PARTIAL_VIRTUALIZATION_THRESHOLD;
}

export function getWebMountedRecentStreamItems(): number {
  return getMountedRecentStreamItems();
}

export interface IndexedStreamItem {
  item: StreamItem;
  index: number;
}

export interface WebVirtualizedHistoryWindow {
  virtualizedEntries: IndexedStreamItem[];
  mountedEntries: IndexedStreamItem[];
}

interface StreamItemHeightEstimateInput {
  item: StreamItem;
  contentMaxWidth: number;
  imageContext?: AssistantImageContext;
}

// The text a plugin row carries, when its payload is message-shaped. The
// payload is opaque JSON, so read defensively and let a miss fall through.
function pluginItemText(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const text = (data as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

// A plugin row replaces a native row, so it must be estimated as the row it
// replaced. Claimed assistant messages are the case that matters: they carry
// full markdown and run to hundreds or thousands of pixels, so the old default
// guess of 120px left the virtualizer's offsets far out and paging back into
// unmeasured history landed on empty space (Des, 2026-10-19).
// Kinds a plugin other than the one below emits keep the previous default, so
// this cannot change another plugin's behaviour.
function estimatePluginItemHeight({
  item,
  contentMaxWidth,
  imageContext,
}: {
  item: PluginTimelineStreamItem;
  contentMaxWidth: number;
  imageContext?: AssistantImageContext;
}): number {
  switch (item.itemKind) {
    case "semantic-markdown": {
      const text = pluginItemText(item.data);
      if (text === null) return 220;
      return (
        estimateAssistantMessageHeightFromCache({
          markdown: text,
          contentMaxWidth,
          imageContext,
        }) ?? 220
      );
    }
    // One line at native tool-row height.
    case "semantic-markdown-tool-call":
    // A few lines of diagnostic; the collapsed row is close enough.
    case "semantic-markdown-load-error":
      return COLLAPSED_TOOL_SEQUENCE_ROW_HEIGHT_ESTIMATE;
    default:
      return 120;
  }
}

export function estimateStreamItemHeight({
  item,
  contentMaxWidth,
  imageContext,
}: StreamItemHeightEstimateInput): number {
  switch (item.kind) {
    case "user_message":
      return item.images && item.images.length > 0 ? 220 : 96;
    case "assistant_message":
      return (
        estimateAssistantMessageHeightFromCache({
          markdown: item.text,
          contentMaxWidth,
          imageContext,
        }) ?? 220
      );
    case "tool_call":
      return COLLAPSED_TOOL_SEQUENCE_ROW_HEIGHT_ESTIMATE;
    case "thought":
      return COLLAPSED_TOOL_SEQUENCE_ROW_HEIGHT_ESTIMATE;
    case "todo_list":
      return 144;
    case "notification":
      return 88;
    case "compaction":
      return 72;
    case "plugin":
      return estimatePluginItemHeight({ item, contentMaxWidth, imageContext });
    default:
      return 120;
  }
}

export { findMountedWindowStart };

export function splitWebVirtualizedHistory(input: {
  entries: IndexedStreamItem[];
  minMountedCount: number;
}): WebVirtualizedHistoryWindow {
  const startIndex = findMountedWindowStart({
    items: input.entries.map((entry) => entry.item),
    minMountedCount: input.minMountedCount,
  });
  return {
    virtualizedEntries: input.entries.slice(0, startIndex),
    mountedEntries: input.entries.slice(startIndex),
  };
}
