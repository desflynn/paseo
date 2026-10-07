# Tool-results renderer spike

## Owner scope

- Separate plugin, approved by Des; begin work now.
- Preserve Paseo's original tool rendering as the baseline, then extend content inspection.
- Cross-platform desktop/mobile; semantic-markdown untouched.
- No live plugin installation/config changes or daemon restart during preparation.
- No core patches, new dependencies, commits or pushes without a specific need/approval.

## Conn continuation

- Des invoked /conn: finish the in-train work, no routine stops/questions. Grouping/parity work is now explicit in the live task list, not parked in prose.
- Plugin-only remains absolute; no core runtime/source hook, no live activation/config changes during verification.
- Grouping scope: restore consecutive claimed unknown/MCP rows while leaving specialized native renderers intact. Non-tool/specialized boundaries, lifecycle/history/reconnect/epoch handling must be tested.
- Decision: use existing public SDK timeline observation instead of polling or transformer side effects. Shared observation per viewed host/agent is necessary to avoid one subscription per row; keep it small and tear it down on unmount.
- Grouping helper c9becc18-ec4d-41a2-8321-efc4388ef844 owns new shared/grouping.ts+test, client/use-tool-groups.ts, GROUP-WORKLOG.md.
- Presentation helper 73352e09-cbce-46d8-81a7-ccbb79c41ec8 owns new shared/presentation.ts+test, PRESENTATION-WORKLOG.md.
- Both Z.AI GLM-5.3-Flash high in parent workspace. Parent owns renderer/index/E2E wiring and final checks. First waits performed immediately after launch. Both harvested and archived; no helpers remain running.
- Presentation helper shipped 24 behavioural tests. Parent corrected internal lowercase icon identifiers to actual SDK Lucide names and integrated display/loading/empty-detail semantics.
- Grouping helper shipped 29 reducer tests, SDK observation and cleanup. Parent review required host+agent keying, acquire-driven start/StrictMode revival, seqEnd freshness with stable seqStart anchors, message-boundary dedupe/speak exclusion, and earliest mounted member as physical group host.
- Renderer now uses SDK-backed grouping for consecutive unknown-detail calls; first logical source ID stays stable, all member data/status remains available, wide disclosure and compact nested host dialogs work. Specialized native tools remain untouched/group boundaries.

## Completed fast helpers

- 48ce887f-366d-4112-bc0f-cc4e13d5ca22 — Z.AI GLM-5.3-Flash high, real tool rows. Owns shared/tool-call.ts/test.ts, client/tool-row.tsx, index.client.tsx, ROW-WORKLOG.md only.
- 51b9e1fe-6934-43d1-abc5-b665338bca0e — Z.AI GLM-5.3-Flash high, bounded vendor parity audit. Owns VENDOR-AUDIT.md only; all source read-only.
- Both attached to parent workspace wks_fb51e963694dbea1. Des briefly suggested OG2DS, then explicitly chose Z.AI before launch. No live activation/core hook permitted.
- Parent owns existing result model/view/preview, E2E integration and checks. No overlapping source ownership.
- Both launched, watched and harvested. Audit helper and row helper are now archived. Row helper reported 8 passing tests, typecheck/lint green. Parent reviewed and corrected integration bugs before browser tests.

## Done

- Confirmed checkout 0.10.3-df; foreign guidance/skills/handoff changes present, left untouched.
- Existing timeline transformer supports tool_call, but replacing it bypasses built-in grouping and detail machinery. Parity must be demonstrated, not claimed.

- SDK host UI does not export ToolCallDetailsContent or native tool-row/group components. Initial full-row replacement lost grouping; plugin-owned grouping is now implemented and verified below. No private host UI imports/core hooks.
- Separate client-only fixture preview implemented with Native / Inspect / Raw tabs.
- Native result detail uses the actual bundled protocol buildPaseoToolDetailSections helper, source-matched section selection/raw serialization, and a port of its label/value layout. This is detail-content parity groundwork, NOT pixel-perfect/full-row parity.
- Inspect mode unwraps structured MCP results or single JSON text blocks. Matching scalar records become a wide table or compact cards. Heterogeneous lists/nested objects retain fields; original envelopes remain in Raw.
- Initial preview did not intercept rows. Real-row stage now registers an unknown-detail tool_call transformer: specialized read/edit/shell/search/etc rows remain host-rendered. No new runtime dependencies installed; existing workspace protocol helpers are bundled.
- Parent review fixed renderer kind/id syntax, JSON-only payload eligibility (removed undefined optional properties), and retained the complete canonical source object for Raw inspection.
- Added real-host regression in existing packages/app/src/plugins/timeline/model.test.ts; first RED caught rejected dotted kind, then GREEN proved host acceptance/source preservation. This and browser suites are test-only changes outside plugin; no Paseo runtime code/hook changed.
- Restored wide collapse/expand and used public SDK Modal.Content/gesture ScrollView for compact details. Running and canceled calls remain inspectable; errors/status are visible.
- Pure-model verification: 12 result tests + 8 reviewed row tests + 1 host integration regression. Plugin and repository typechecks and scoped lint pass.
- TDD RED/GREEN for classification, native empty/scalar section behaviour, and duplicate row identity. 12 tests pass; scoped lint and plugin typecheck pass. Logs /tmp/paseo-tool-results-\*.log.
- Added two cases to existing packages/app/e2e/browser/plugin-timeline.spec.ts (only new tests will run), installing plugin ONLY into the isolated worker daemon. These check native groups survive, table/card inspection renders and raw envelope remains accessible.

## Verification

- Actual plugin installed/compiled in isolated worker daemon, wide 1100 test passed; compact 390 test initially stalled because sidebar was collapsed, then passed after using Open menu. Reran only the failed compact case.
- Both tests assert native chat grouping survives, result records render in Inspect, and Raw preserves the original structuredContent envelope.
- Screenshots /tmp/tool-results-spike-1100.png and /tmp/tool-results-spike-390.png inspected and shown to Des. These are fixture previews, NOT live-tool interception or real-device proof.
- Logs /tmp/paseo-tool-results-browser.log (wide passed, original compact failure) and /tmp/paseo-tool-results-compact.log (compact passed). Isolated daemon/Metro stopped and test plugin removed after tests; live daemon/config unchanged.

- Two streamed MCP-shaped browser cases pass (1100, 390), exercising real plugin transformation, Native/Inspect/Raw controls, wide disclosure/compact SDK modal and original raw envelope access. /tmp/paseo-tool-row-browser.log; screenshots /tmp/tool-results-real-rows-1100.png and /tmp/tool-results-real-rows-390.png (compact inspected/shown).
- Claimed unknown-detail rows now have plugin-owned overview groups. Scope is not a pixel-perfect/all-tool replacement: specialized native rows stay host-owned. Mixed runs are deliberately split at specialized/native boundaries instead of re-rendering those tool types.
- Grouped history browser cases pass at 1100/390, including failed/canceled summaries, source Raw preservation, nested compact dialogs and reload. Streamed browser cases initially failed on a stale expectation for a now-collapsed label; corrected the test to open the group and both layouts pass. /tmp/paseo-tool-groups-browser.log, /tmp/paseo-tool-stream-retry.log.
- Test proxy now rewrites both live and fetched canonical histories; SDK observations therefore see the same MCP-shaped source as the host, rather than a false live-only fixture.
- Presentation 24 tests green after SDK icon fix; grouping 29 + source 9 + result 12 were reported green by grouping helper after parent source reconstruction change (74 focused model tests total). Repository and plugin typechecks + scoped lint pass.
- Paseo category browser case passed, proving Called Paseo counts/labels plus failed/canceled member data and reload. Follow-up viewport assertion also passed: Raw scrolled into viewport before screenshot. /tmp/paseo-tool-viewport-proof.log; /tmp/tool-results-groups-paseo-1100.png inspected/shown.
- Final scoped lint, plugin typecheck and repository typecheck pass; git diff --check clean. Browser worker daemons and Metro stopped after each run; live config/daemon unchanged.
- Five focused browser cases green: streamed rows at 1100/390, grouped dci history at 1100/390, grouped Paseo category at 1100 (plus viewport-proof refinement). Earlier preview/native-specialized preservation cases remain green; no unnecessary reruns.

## Live UAT corrections (owner feedback)

- Owner approved testing; installed tool-results-spike in live /Users/des/.paseo, running alongside semantic-markdown. No restart. Config backup /Users/des/.paseo/config.json.bak-20261003-tool-results. Rollback: disable only tool-results-spike.
- Owner uses detailed / one-by-one. Forced overview was a regression, not a desired default. Restore user's actual setting; overview observer only mounted when requested.
- Inspect worse than Native is a failure. Inspect must be first/default and extract useful payloads from real prefixed JSON/MCP wrappers. Native remains baseline, Raw original call.
- Active helper e6f4b8ac-2173-48ed-8c61-abd163191ccf owns new grouping preference adapter/parser/tests/log. Parent owns row wiring.
- Active helper 238fbb10-b5f0-4757-afa6-bc9d48b9728b owns shared/results.ts/test and clarity log. Parent owns UI/tab order and E2E. Both Z.AI Flash high; immediate waits performed.
- Owner Get Agents screenshots: Inspect shows summary lines and embedded JSON as one text blob. TodoWrite screenshot: wrapper content/hooks and nested details/tasks create a tower rather than task list.
- Mobile explicitly parked at end of task list. Mechanic bug parked: Flight > Plan Seat failed MCP Error: escaped JSON plus expected-parameter prose dumped in red; no seat workflow repair/dispatch authorized.
- Current: tab order/default changed to Inspect in source; preference + classifier helpers underway. Do not reload live until focused checks and real-shaped fixture screenshots are good.
- Helper e6f4b8ac archived: useToolCallGroupingPreference() (client/grouping-preference.ts) + shared parser (shared/grouping-preference.ts, 11 tests). Enum overview|detailed; key @paseo:app-settings; legacy @paseo:settings + compactToolCalls migration mirrored; invalid → detailed (one-by-one safe default). Storage/focus/visibility subscription, no polling; same-tab changes land on focus (DOM storage events are cross-tab only).
- Helper 238fbb10 archived: shared/results.ts rewrite (18 tests). Bounded bracket-depth JSON scanner (16 candidates, 256KB) extracts payloads from prefixed MCP text; unwrap priority structuredContent → single-array details (TodoWrite tasks) → exact-JSON part over hook reminders → embedded body; prose preserved as annotated carrier; table rule relaxed to rich/nullable cells with one backbone column, rows never drop fields. Raw untouched.
- Parent wiring: useToolGroups gained enabled param (no observation/subscription/fetch while off); ToolCallRow gates on useToolCallGroupingPreference(); result-view renders annotated (muted prose + recursive view, compact one-line) and empty table cells (was "undefined"); Inspect is the default tab, order Inspect|Native|Raw.
- E2E updated: grouped cases opt into overview via localStorage; streamed cases assert default detailed renders rows individually (no group button); grouped fixture now uses realistic prefixed MCP text and asserts prose + agent table cells in Inspect.
- Verification: 91 plugin tests green, plugin typecheck clean, scoped lint clean, 7/7 browser cases green (~2.2m). Live plugin remains disabled per owner; source staged — reload+enable when next test called.
- Owner requested plugin disabled until next test; done (semantic-markdown untouched).

## Completion / hold (superseded by UAT above)

- Isolated spike implementation and verification complete. Both helpers archived, no test jobs left running. Hold without installing/enabling it live, restarting production, committing or pushing.
- Specialized tools continue using their original renderer (not vendored/replaced). Claimed MCP/unknown runs use their own grouping, splitting at native-tool boundaries. Group summary text is English; custom Paseo SVG and one-click/per-field copy toolbar are not ported. Values/raw data remain selectable/copyable. No pixel-perfect/all-tool replacement claim.

## Separate rollout / future scope

- Text is selectable multiline prose in this first spike, not a Markdown parser. Images/multipart media remain preserved/raw, not new media rendering.
- Real-device Hermes verification and live activation remain separate owner steps.
- No commits/pushes or production configuration changes performed.
- Resume path: actual-device/live UAT only after owner authorizes that environment; plugin path des/plugins/tool-results-spike. Core runtime and des/plugins/semantic-markdown untouched; only two existing host/E2E regression suites changed outside plugin.
