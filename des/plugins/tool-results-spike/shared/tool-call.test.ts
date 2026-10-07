import { describe, expect, test } from "vitest";
import { buildToolCallDisplayModel } from "@getpaseo/protocol/tool-call-display";
import type { ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import {
  TOOL_ROW_KIND,
  TOOL_ROW_VERSION,
  stableToolRowId,
  sourceItemFromData,
  toolRowDataSchema,
  transformToolCallItem,
} from "./tool-call";

function unknownToolCall(overrides: Partial<ToolCallTimelineItem> = {}): ToolCallTimelineItem {
  return {
    type: "tool_call",
    callId: "call_42",
    name: "web_search",
    detail: { type: "unknown", input: { query: "rvr.ie" }, output: { hits: 3 } },
    status: "completed",
    error: null,
    metadata: { server: "mcp-main" },
    ...overrides,
  } as ToolCallTimelineItem;
}

function transform(item: ToolCallTimelineItem) {
  const result = transformToolCallItem(item);
  expect(result).toBeDefined();
  const [row] = result!.items;
  expect(row).toBeDefined();
  expect(row.type).toBe("plugin");
  expect(row.kind).toBe(TOOL_ROW_KIND);
  expect(row.version).toBe(TOOL_ROW_VERSION);
  return { row, data: toolRowDataSchema.parse(row.data) };
}

describe("tool_call row transform", () => {
  test("reconstructs canonical grouping sources without losing extra fields or failure state", () => {
    const original = unknownToolCall({ status: "failed", error: "boom", traceId: "retained" });
    const { data } = transform(original);
    expect(sourceItemFromData(data)).toEqual(original);
  });
  test("preserves the canonical source item in JSON-compatible plugin data", () => {
    const { data } = transform(unknownToolCall());
    expect(data.callId).toBe("call_42");
    expect(data.name).toBe("web_search");
    expect(data.status).toBe("completed");
    expect(data.metadata).toEqual({ server: "mcp-main" });
    expect(data.input).toEqual({ query: "rvr.ie" });
    expect(data.output).toEqual({ hits: 3 });
  });

  test("keeps identity and data stable across the item lifecycle", () => {
    const running = transform(unknownToolCall({ status: "running" }));
    const completed = transform(unknownToolCall({ status: "completed" }));
    expect(running.row.id).toBe(stableToolRowId("call_42"));
    expect(running.row.id).toBe(completed.row.id);
    expect(running.data.status).toBe("running");
    expect(completed.data.status).toBe("completed");
  });

  test("preserves failed errors, including non-JSON Error instances", () => {
    const failed = transform(unknownToolCall({ status: "failed", error: "boom" }));
    expect(failed.data.status).toBe("failed");
    expect(failed.data.error).toBe("boom");
    const thrown = transform(unknownToolCall({ status: "failed", error: new Error("nope") }));
    expect(thrown.data.error).toBe("nope");
  });

  test("marks canceled rows without inventing an error", () => {
    const canceled = transform(unknownToolCall({ status: "canceled" }));
    expect(canceled.data.status).toBe("canceled");
    expect(canceled.data.error).toBeNull();
  });

  test("leaves specialized detail rows untouched for host rendering", () => {
    const specialized: ToolCallTimelineItem[] = [
      unknownToolCall({ detail: { type: "shell", command: "ls" } }) as ToolCallTimelineItem,
      unknownToolCall({
        detail: { type: "read", filePath: "/tmp/a" },
      }) as ToolCallTimelineItem,
      unknownToolCall({
        detail: { type: "edit", filePath: "/tmp/a", oldString: "a", newString: "b" },
      }) as ToolCallTimelineItem,
      unknownToolCall({
        detail: { type: "sub_agent", log: "hi" },
      }) as ToolCallTimelineItem,
    ];
    for (const item of specialized) {
      expect(transformToolCallItem(item)).toBeUndefined();
    }
  });

  test("computes the friendly label with the bundled display helper", () => {
    const item = unknownToolCall();
    const model = buildToolCallDisplayModel(item);
    const { data } = transform(item);
    expect(data.label).toBe(model.displayName);
    expect(data.label).toBe("Web search");
    expect(data.summary).toBe(model.summary);
    expect(data.errorText).toBe(model.errorText);
    // Canonical identity survives next to the friendly label.
    expect(data.name).toBe("web_search");
  });

  test("carries the helper error text for failed rows", () => {
    const { data } = transform(unknownToolCall({ status: "failed", error: "boom" }));
    expect(data.errorText).toBe("boom");
  });

  test("normalizes non-JSON input/output values instead of dropping them", () => {
    const { data } = transform(
      unknownToolCall({
        detail: {
          type: "unknown",
          input: { when: new Date("2026-01-01T00:00:00.000Z"), id: 5n },
          output: [undefined, 1],
        },
      }) as ToolCallTimelineItem,
    );
    expect(data.input).toEqual({ when: "2026-01-01T00:00:00.000Z", id: "5" });
    expect(data.output).toEqual([null, 1]);
  });
});
