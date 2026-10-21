# VENDOR-AUDIT — tool-results-spike

Read-only audit of original render mechanics → plugin-only vendor/reuse map.
State: ✅ done · ⏳ pending. Source untouched. Only this file written.

## Pure helpers (bundleable — no app context)

- ✅ `buildPaseoToolDetailSections`, `PaseoToolDetailSection` — `@getpaseo/protocol/paseo-tool-call-detail`. Already protocol-exported; spike imports it today.
- ✅ `buildToolCallDisplayModel` (+ `ToolCallDisplayModel`) — `@getpaseo/protocol/tool-call-display`. displayName/summary/errorText. Direct import, zero vendoring.
- ✅ `buildToolCallPresentation` — `packages/app/src/tool-calls/presentation.ts`. Pure model (status→icon/loading/hasDetails/canOpenDetails/openFilePath/plan outcome); takes `resolveIcon` as a param. Vendor-copy as one file; deps below.
- ✅ `hasMeaningfulToolCallDetail`, `isPendingToolCallDetail` — `app/src/utils/tool-call-detail-state.ts` (loading/cancel detection). `extractToolCallFilePath` — `app/src/utils/extract-tool-call-file-path.ts`. `resolveToolCallIcon` — `app/src/utils/tool-call-icon.ts` + `-name.ts` (lucide-react-native dep — already in app bundle).
- ✅ `describeToolCall`, `buildOverviewGroup` — `app/src/tool-calls/detail-level/grouping.ts` + `overview/model.ts` are pure, but consume app `StreamItem`/`ToolCallRun` shapes (see grouping boundary).

## Context-bound components (do NOT vendor; rebuild thin against PluginTheme)

- ❌ `ExpandableBadge` — `components/message.tsx` (the header/status row: icon, label, secondaryLabel, isLoading, isError, inline renderDetails). Buried in 3.2k-line file with unistyles/i18n.
- ❌ `ToolCallDetailsContent` + per-type sections (edit diff, shell, search, fetch, subagent) — `components/tool-call-details.tsx`. Needs unistyles, i18n `t()`, DiffViewer, HighlightedLines, code insets, GH ScrollView.
- ❌ `ToolCallSheetProvider`/`ToolCallSheetModal`/`ToolCallSheetContent` — `components/tool-call-sheet.tsx`. @gorhom/bottom-sheet + IsolatedBottomSheetModal + context bridge — provider context plugin surfaces don't have.
- ❌ `OverviewToolCallGroupView`/Sheet — `detail-level/overview/view.tsx`/`sheet.tsx` + `ExpandableBadge` grouping UI.

## Category map

1. ✅ Header/status/icon/label → `buildToolCallDisplayModel` (label/summary/errorText) + `buildToolCallPresentation` + `resolveToolCallIcon` (icon); row rendered by `ExpandableBadge`. Plugin: pure parts vendorable; row chrome re-skinned with PluginTheme.
2. ✅ Wide inline vs compact modal → `ToolCall` (message.tsx:3044): original picks inline details or a sheet. Plugin can use the public SDK `Modal`, `Modal.Content` and gesture-aware `ScrollView` for compact details; these are exported host components, unlike private ToolCallSheetProvider. The row helper now uses that route, with wide collapse/expand added in parent review. Exact visual parity still requires evidence.
3. ✅ Raw/Paseo sections → `buildPaseoToolDetailSections` (protocol) for known types; unknown fallback = spike's `nativeUnknownSections` port (matches `buildUnknownSections` semantics; tests green). No action needed.
4. ✅ Copying/errors/loading/cancel → copying = selectable `Text` only (no copy button exists in originals); loading = `isPendingToolCallDetail` + skeleton; errors = `ErrorSection` (errorText) / badge `isError`; cancel = status `"canceled"`. GAP: spike `ToolResultProps` has no status/error input at all.
5. ✅ Grouping boundary → the transformer itself sees one item and does not expose host grouping. Do not equate that with plugin-only grouping being impossible: the public SDK agent handle exposes `timeline.refetch()` and `subscribe()`, so a plugin-owned projection using bundled/vendor helpers is a possible avenue. Placement, boundaries and live/history parity are not yet proven. No core hook is approved or required for that investigation.

## Spike gaps → prioritized plugin-only actions

- P1 ⏳ Add `status`/`errorText` to renderer data schema (transformer side is teammate's file — coordinate), render pending skeleton + error/cancel sections in `ToolResultView`.
- P2 ⏳ Vendor `presentation.ts` + `tool-call-detail-state` + `extract-tool-call-file-path` into `shared/` for header/label/loading parity.
- P3 ⏳ Port shell/edit/fetch section layouts from `tool-call-details.tsx` as plain `PluginTheme`-styled components (medium effort; skip diff-highlight first pass).
- P4 ⏳ Icons: fallback single icon now; optional `tool-call-icon-name` map port later.
- Deferred ⏳ Grouping UI — not implemented for claimed rows. Investigate SDK-backed plugin-owned projection if needed; no fake parity and no source-hook proposal.

Done: audit + map. Parent review corrected the too-strong grouping impossibility claim and identified the existing SDK Modal. Real-row helper added labels/status/errors/cancellation and source preservation; remaining P2–P4 fidelity work is not yet complete.
