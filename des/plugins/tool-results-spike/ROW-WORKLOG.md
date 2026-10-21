# ROW-WORKLOG — tool_call timeline rows (unknown-detail MCP step)

Owner: glm-5.3-flash (NARROWBODY). Scope: shared/tool-call.ts, shared/tool-call.test.ts,
client/tool-row.tsx, index.client.tsx, this file only.

## Done

- [x] Red tests first: shared/tool-call.test.ts (8 tests — red confirmed, module missing).
- [x] shared/tool-call.ts: `toolRowDataSchema` (recursive JSON-safe Zod schema),
      `TOOL_ROW_KIND = "tool-results.tool-call"`, `TOOL_ROW_VERSION = 1`,
      `stableToolRowId(callId)` → `tool-results-spike:<callId>` (stable across lifecycle),
      `transformToolCallItem(item)` — unknown-detail rows only; specialized details
      (shell/read/edit/sub_agent/etc) return undefined → host passthrough.
      Canonical callId/name/status/metadata/input/output preserved; Error → message,
      Date → ISO, BigInt/Symbol/function → String() (JSON-compatible). Friendly
      label/summary/errorText from bundled `buildToolCallDisplayModel`; canonical
      `name` retained in data.
- [x] client/tool-row.tsx: `ToolCallRow` renderer — collapsed header (status icon /
      ActivityIndicator while running, friendly label, helper summary), failed error
      text (selectable), "Canceled" / "Running…" lines, completed/failed body hosts
      existing ToolResultView (Native/Inspect/Raw tabs preserved). Wide: inline
      details; compact: host `Modal` from `@getpaseo/plugin/client/react-native`.
- [x] index.client.tsx: registered `addTimelineTransformer` (query itemType
      "tool_call") + `addTimelineRenderer` (kind/version/schema/Component); both in
      cleanup; preview surface + sidebar untouched.
- [x] Green: 8 tool-call tests passed with `--bail=1`.
- [x] Plugin typecheck and targeted lint passed; files formatted.

## Parity limitations (honest)

- Claimed rows lose host overview grouping — the public transformer hook cannot
  retain it. Row-level parity only; group parity is NOT claimed.
- Transformer runs on any `tool_call`; renderer claims unknown-detail only. If the
  host renders a group header around plugin items, grouping behavior there is
  host-owned and unverified here.
- E2E browser verification of the registered row is parent-owned; only unit tests +
  typecheck are proven in this unit of work.

## Pending / notes

- No new dependency (zod + @getpaseo/protocol helper already bundled).
- No commits/pushes made per brief.
