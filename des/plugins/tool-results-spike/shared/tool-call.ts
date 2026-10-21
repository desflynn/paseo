import { z } from "zod";
import type { PluginTimelineItem, PluginTimelineTransformResult } from "@getpaseo/plugin";
import type { ToolCallTimelineItem } from "@getpaseo/protocol/agent-types";
import { buildToolCallDisplayModel } from "@getpaseo/protocol/tool-call-display";
import { isRecord } from "./results";

export const TOOL_ROW_KIND = "tool-results-tool-call";
export const TOOL_ROW_VERSION = 1;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

export const toolRowDataSchema = z.object({
  callId: z.string(),
  source: jsonSchema,
  name: z.string(),
  status: z.enum(["running", "completed", "failed", "canceled"]),
  label: z.string(),
  summary: z.string().optional(),
  errorText: z.string().optional(),
  error: jsonSchema.nullable().optional(),
  metadata: jsonSchema.optional(),
  input: jsonSchema.optional(),
  output: jsonSchema.optional(),
});

export type ToolRowData = z.output<typeof toolRowDataSchema>;

export function stableToolRowId(callId: string): string {
  return `tool-results-spike:${callId}`;
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry) ?? null);
  }
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const json = toJsonValue(entry);
      if (json !== undefined) out[key] = json;
    }
    return out;
  }
  return String(value);
}

export function sourceItemFromData(data: ToolRowData): ToolCallTimelineItem {
  const base = {
    ...(isRecord(data.source) ? data.source : {}),
    type: "tool_call" as const,
    callId: data.callId,
    name: data.name,
    detail: { type: "unknown" as const, input: data.input ?? null, output: data.output ?? null },
    ...(isRecord(data.metadata) ? { metadata: data.metadata } : {}),
  };
  return data.status === "failed"
    ? { ...base, status: "failed", error: data.error ?? null }
    : { ...base, status: data.status, error: null };
}

/**
 * Transforms unknown-detail tool_call rows into plugin timeline items rendered
 * by client/tool-row.tsx. Specialized detail rows (shell, read, edit, ...)
 * return undefined so the host keeps rendering them.
 */
export function transformToolCallItem(
  item: ToolCallTimelineItem,
): PluginTimelineTransformResult | undefined {
  if (item.detail.type !== "unknown") return undefined;
  const model = buildToolCallDisplayModel(item);
  const error = toJsonValue(item.error);
  const data: ToolRowData = {
    callId: item.callId,
    source: toJsonValue(item) ?? null,
    name: item.name,
    status: item.status,
    label: model.displayName,
    summary: model.summary,
    errorText: model.errorText,
    error,
    metadata: toJsonValue(item.metadata),
    input: toJsonValue(item.detail.input),
    output: toJsonValue(item.detail.output),
  };
  const row: PluginTimelineItem = {
    type: "plugin",
    id: stableToolRowId(item.callId),
    kind: TOOL_ROW_KIND,
    version: TOOL_ROW_VERSION,
    data: JSON.parse(JSON.stringify(data)) as PluginTimelineItem["data"],
  };
  return { items: [row] };
}
