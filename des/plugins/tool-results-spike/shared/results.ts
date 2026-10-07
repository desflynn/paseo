export type ResultView =
  | { kind: "text"; text: string }
  | { kind: "scalar"; value: unknown }
  | { kind: "record"; fields: Array<[string, unknown]> }
  | { kind: "annotated"; prose: string; view: ResultView }
  | { kind: "list"; items: unknown[] }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[] };

// Renderer contract for parents (compact and wide):
// - "annotated": render `prose` as a muted text block, then render `view`
//   recursively (compact: collapse prose to one line; wide: full block).
// - "table": columns are the union of row keys in first-seen order; a column
//   may be absent from a row (optional fields render empty, not "undefined"),
//   and cells may be objects/arrays/null — render scalars inline and non-
//   scalars via rawText. Rows are the original records; no field is dropped.
// unwrapResult may return { prose: string, payload: unknown } when prose
// surrounded an embedded JSON body; inspectResult maps that shape to
// "annotated". The original output object is never mutated — Raw stays intact.

const MAX_UNWRAP_DEPTH = 4;
const MAX_TEXT_PARTS = 8;
const MAX_JSON_CANDIDATES = 16;
const MAX_JSON_SCAN = 262_144;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPayload(value: unknown): boolean {
  return isRecord(value) || Array.isArray(value);
}

// Index just past the complete JSON value starting at `start`, or -1.
// Bracket-depth walk honouring strings and escapes; no regex.
function jsonSpan(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(text.length, start + MAX_JSON_SCAN);
  for (let i = start; i < limit; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function tryFullJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    const value: unknown = JSON.parse(trimmed);
    return isPayload(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

// Bounded scan: try each brace/bracket as a payload start, accept the first
// candidate whose full balanced body parses as an object or array.
function findEmbeddedJson(text: string): { value: unknown; prose: string } | undefined {
  let attempts = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    if (++attempts > MAX_JSON_CANDIDATES) return undefined;
    const end = jsonSpan(text, i);
    if (end === -1) continue;
    try {
      const value: unknown = JSON.parse(text.slice(i, end));
      if (!isPayload(value)) continue;
      const before = text.slice(0, i).trim();
      const after = text.slice(end).trim();
      return { value, prose: [before, after].filter(Boolean).join("\n") };
    } catch {
      // Fall through to the next candidate.
    }
  }
  return undefined;
}

function textParts(output: Record<string, unknown>): string[] {
  if (!Array.isArray(output.content)) return [];
  return output.content
    .filter(
      (part): part is Record<string, unknown> & { text: string } =>
        isRecord(part) && part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .slice(0, MAX_TEXT_PARTS);
}

// A details-style envelope yields its single array payload (e.g. TodoWrite
// tasks) when every sibling field is scalar metadata. Shape-driven, not
// name-driven, and ambiguous shapes (two arrays, nested objects) stay put.
function singleArrayPayload(container: unknown): unknown[] | undefined {
  if (!isRecord(container)) return undefined;
  const entries = Object.entries(container);
  const arrays = entries.filter(([, value]) => Array.isArray(value));
  if (arrays.length !== 1) return undefined;
  const metadataOnly = entries.every(
    ([, value]) =>
      Array.isArray(value) ||
      value === null ||
      ["string", "number", "boolean"].includes(typeof value),
  );
  return metadataOnly ? (arrays[0][1] as unknown[]) : undefined;
}

function isProseCarrier(value: unknown): value is { prose: string; payload: unknown } {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    typeof value.prose === "string" &&
    "payload" in value
  );
}

function unwrapValue(value: unknown, depth: number): unknown {
  return isRecord(value) ? unwrapEnvelope(value, depth) : value;
}

function unwrapEnvelope(output: Record<string, unknown>, depth: number): unknown {
  if (depth <= 0) return output;
  if (output.structuredContent !== undefined) {
    return unwrapValue(output.structuredContent, depth - 1);
  }
  const details = singleArrayPayload(output.details);
  if (details !== undefined) return details;
  const parts = textParts(output);
  if (parts.length) {
    for (const part of parts) {
      const full = tryFullJson(part);
      if (full !== undefined) return unwrapValue(full, depth - 1);
    }
    for (const part of parts) {
      const found = findEmbeddedJson(part);
      if (found) return { prose: found.prose, payload: found.value };
    }
    if (Array.isArray(output.content) && output.content.length === 1 && parts.length === 1) {
      return parts[0];
    }
  }
  return output;
}

export function unwrapResult(output: unknown): unknown {
  return unwrapValue(output, MAX_UNWRAP_DEPTH);
}

function unionKeys(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  return columns;
}

export function inspectResult(value: unknown): ResultView {
  if (typeof value === "string") return { kind: "text", text: value };
  if (Array.isArray(value)) {
    if (value.length && value.every((row) => isRecord(row) && Object.keys(row).length > 0)) {
      const columns = unionKeys(value as Record<string, unknown>[]);
      // One backbone column shared by every row is enough; rich (object) and
      // nullable cells are allowed and stay in the rows, so nothing is dropped.
      if (columns.some((key) => value.every((row) => Object.hasOwn(row, key)))) {
        return { kind: "table", columns, rows: value as Record<string, unknown>[] };
      }
    }
    return { kind: "list", items: value };
  }
  if (isProseCarrier(value)) {
    return { kind: "annotated", prose: value.prose, view: inspectResult(value.payload) };
  }
  if (isRecord(value)) return { kind: "record", fields: Object.entries(value) };
  return { kind: "scalar", value };
}

// Ported from Paseo's hasMeaningfulUnknownValue; retain false/zero and hide empty containers.
function meaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  if (typeof value === "object") return Object.values(value).some(meaningful);
  return true;
}

export function nativeUnknownSections(input: unknown, output: unknown) {
  if (typeof input === "string" && output === null) return [{ title: "", value: input }];
  return [
    { title: "Input", value: input },
    { title: "Output", value: output },
  ].filter((section) => meaningful(section.value));
}

export function keyedItems<Value>(items: readonly Value[]) {
  const occurrences = new Map<string, number>();
  return items.map((value) => {
    const content = rawText(value);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { key: `${content}:${occurrence}`, value };
  });
}

export function rawText(value: unknown): string {
  return typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "undefined");
}
