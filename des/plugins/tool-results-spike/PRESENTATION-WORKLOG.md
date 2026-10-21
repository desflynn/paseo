# PRESENTATION-WORKLOG — tool-results-spike parity presentation model

Owner: this file only (plus shared/presentation.ts, shared/presentation.test.ts).
Scope: pure parity model for unknown-detail MCP tool rows. No core changes, no
plugin source/index/test-script edits, no installs, no commits.

## Status: DONE

- [x] Unit 1 — RED: presentation.test.ts written against original app/protocol behaviour; failed on missing module (module-not-found).
- [x] Unit 2 — GREEN: presentation.ts implemented; 24/24 pass via root `npx vitest run des/plugins/tool-results-spike/shared/presentation.test.ts --bail=1`.
- [x] Unit 3 — Verify: `npx tsc --noEmit -p des/plugins/tool-results-spike/tsconfig.json` exit 0; `npm run lint -- <both new files>` 0 warnings/0 errors.

## Exported contract (shared/presentation.ts)

- `interface ToolRowPresentation`: `status` (passthrough of row status),
  `displayName`, `summary?`, `errorText?` (failed only), `isLoadingDetails`,
  `hasDetails`, `canOpenDetails` (= hasDetails || isLoadingDetails), `iconName`
  (string accepted by SDK Icon).
- `buildToolRowPresentation(data: ToolRowData): ToolRowPresentation`.

## Decisions (captain's log)

- Reused protocol `buildToolCallDisplayModel` directly (same import the plugin's
  tool-call.ts already uses) by reconstructing `{type:"unknown", input, output}`
  at the type boundary — original mechanics preserved, not reinterpreted.
  displayName recomputed this way equals the stored `data.label` (tested).
- App-private pure logic copied with provenance comments, adapted only at the
  type boundary: `hasMeaningfulUnknownValue` + unknown branch
  (packages/app/src/utils/tool-call-detail-state.ts) and `isPendingToolCallDetail`
  (row status union has no "executing"; normalised at transform time).
  Semantics preserved: empty object/array/blank string = no detail; false/0 = detail.
- Icon: ported the name-level resolution from
  packages/app/src/utils/tool-call-icon-name.ts for unknown-detail rows
  (thinking→brain, speak→mic_vocal, paseo→paseo, task→bot, else wrench).
  String names only — no lucide imports, no private app contexts, no new deps.
- Test fix during RED→GREEN: expected "My Tool" but original `humanizeToolName`
  lowercases then capitalises only the first char → "My tool". Test corrected to
  match the authoritative original; implementation untouched.

## Evidence

- RED: 1 failed file, "no tests" (missing module) — 17:39:33 local.
- GREEN: 24 passed / 24 — 17:40:43 local.
- Typecheck exit 0; oxlint 0 warnings on the two new files.
