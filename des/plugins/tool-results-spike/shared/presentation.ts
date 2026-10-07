import { buildToolCallDisplayModel } from "@getpaseo/protocol/tool-call-display";
import { isPaseoToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { ToolRowData } from "./tool-call";

/**
 * Layout-neutral header state for one unknown-detail tool row. Collapse
 * controls, loading, error and icon rendering read these outputs; the row
 * status is carried through unchanged.
 */
export interface ToolRowPresentation {
  status: ToolRowData["status"];
  displayName: string;
  summary?: string;
  errorText?: string;
  isLoadingDetails: boolean;
  hasDetails: boolean;
  canOpenDetails: boolean;
  iconName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Provenance: hasMeaningfulUnknownValue copied from
// packages/app/src/utils/tool-call-detail-state.ts, adapted only at the type
// boundary — ToolRowData input/output are JSON values from the plugin row, not
// a protocol ToolCallDetail. Semantics preserved: empty objects, arrays and
// blank strings carry no detail; false and 0 do.
function hasMeaningfulUnknownValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulUnknownValue);
  }
  if (typeof value === "object") {
    return Object.values(value).some(hasMeaningfulUnknownValue);
  }
  return true;
}

// Provenance: the "unknown" branch of hasMeaningfulToolCallDetail in the same
// app source file.
function hasMeaningfulUnknownToolDetail(
  input: ToolRowData["input"],
  output: ToolRowData["output"],
): boolean {
  return hasMeaningfulUnknownValue(input) || hasMeaningfulUnknownValue(output);
}

// Provenance: isPendingToolCallDetail from the same app source file, adapted
// to the row status union — plugin rows have no "executing" state because
// transformToolCallItem normalises it at transform time.
function isPendingRowDetail(
  status: ToolRowData["status"],
  error: ToolRowData["error"],
  hasMeaningfulDetail: boolean,
): boolean {
  return status === "running" && error == null && !hasMeaningfulDetail;
}

// Provenance: name-level icon resolution for unknown-detail rows from
// packages/app/src/utils/tool-call-icon-name.ts — the unknown entry of
// TOOL_DETAIL_ICON_NAMES ("wrench") plus the name-based overrides. Returns the
// SDK Icon name string; no lucide components are imported here.
function resolveRowIconName(name: string): string {
  const lowerName = name.trim().toLowerCase();
  if (lowerName === "thinking") return "Brain";
  if (lowerName === "speak") return "MicVocal";
  if (isPaseoToolName(lowerName)) return "Bot";
  if (lowerName === "task") return "Bot";
  return "Wrench";
}

export function buildToolRowPresentation(data: ToolRowData): ToolRowPresentation {
  const model = buildToolCallDisplayModel({
    name: data.name,
    status: data.status,
    error: data.error ?? null,
    detail: { type: "unknown", input: data.input ?? null, output: data.output ?? null },
    metadata: isRecord(data.metadata) ? data.metadata : undefined,
  });
  const hasMeaningfulDetail = hasMeaningfulUnknownToolDetail(data.input, data.output);
  const isLoadingDetails = isPendingRowDetail(data.status, data.error, hasMeaningfulDetail);
  const hasDetails = Boolean(data.error) || hasMeaningfulDetail;

  return {
    status: data.status,
    displayName: model.displayName,
    ...(model.summary ? { summary: model.summary } : {}),
    ...(model.errorText ? { errorText: model.errorText } : {}),
    isLoadingDetails,
    hasDetails,
    canOpenDetails: hasDetails || isLoadingDetails,
    iconName: resolveRowIconName(data.name),
  };
}
