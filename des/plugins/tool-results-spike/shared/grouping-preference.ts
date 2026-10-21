export type ToolCallDetailLevel = "overview" | "detailed";

/** Safe default: one-by-one rows. Overview grouping must be opted into by the app setting. */
export const DEFAULT_TOOL_CALL_DETAIL_LEVEL: ToolCallDetailLevel = "detailed";

/**
 * The app user setting this plugin must honor (packages/app settings screen,
 * persisted in `@paseo:app-settings`). The plugin must not keep its own
 * competing preference.
 */
export type ToolCallGroupingSource = Record<string, unknown>;

/**
 * Resolve a persisted app-settings blob to the effective detail level,
 * mirroring packages/app/src/hooks/use-settings/storage.ts:
 *
 * - "overview" | "detailed" win as-is; legacy "concise" mapped to "overview"
 *   (same as the app's zod transform).
 * - A PRESENT but invalid value catches to "detailed" and does not consult
 *   the legacy field (same as the app's `.catch("detailed")`).
 * - An ABSENT value migrates the COMPAT(compactToolCalls) boolean:
 *   true => "overview", otherwise "detailed".
 * - Anything non-object (corrupt JSON parsed to a primitive, null, array)
 *   falls back to the safe default.
 */
export function resolveToolCallDetailLevel(raw: unknown): ToolCallDetailLevel {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_TOOL_CALL_DETAIL_LEVEL;
  }
  const blob = raw as ToolCallGroupingSource;
  const level = blob.toolCallDetailLevel;
  if (level === "overview" || level === "concise") return "overview";
  if (level === "detailed") return "detailed";
  if (level !== undefined && level !== null) return DEFAULT_TOOL_CALL_DETAIL_LEVEL;
  return blob.compactToolCalls === true ? "overview" : DEFAULT_TOOL_CALL_DETAIL_LEVEL;
}

/**
 * Boolean contract for row wiring: true only when the preference calls for
 * overview grouping; false keeps one-by-one rows.
 */
export function prefersToolCallGrouping(raw: unknown): boolean {
  return resolveToolCallDetailLevel(raw) === "overview";
}
