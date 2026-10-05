# CLAUDE-STALE-SUBAGENT-WORKLOG

Bug: Claude provider subagent rows stay "running" forever (one stuck row pins the whole workspace "running" via workspace-directory.ts:331-354). Branch 0.10.3-df. Parent: Paseo Fixer Guy. Do NOT commit.

## Recon (2026-10-05)

- Verified branch `0.10.3-df`; tree has other agents' uncommitted work (pi/agent.ts, plugin-timeline.spec.ts, model.test.ts, worklogs) — untouched.
- `sidechain-tracker.ts` (494 ln): `handleMessage` upserts a `provider_subagent` row status "running" for any frame routed to it; title falls back to "Claude subagent" when the parent tool input has no name/subagent_type. `finishAll(status)` emits terminal upserts for every open row then clears; **no-ops silently when `isDescriptorOwnedElsewhere()`** (agent wires it to `taskProtocolSource.isActive`). `finish(id, status)` closes one row on sidechain tool_result.
- `agent.ts`:
  - L1891 `isClaudeSubagentToolName(name)` = `name === "Task" || name === "Agent" || name === "Workflow"` — **the existing Task/Agent recognition to reuse**; already used at L4341 as `isClaudeSubagentToolName(cachedTool?.name)` off `toolUseCache`.
  - L4170 `translateSidechainFrameToEvents`: L4185 drops undeclared frames once the task protocol announces (`announcesTasks && !canonicalSubagentId`); otherwise routes ALL frames incl. MCP-parent frames into `sidechainTracker.handleMessage` → legacy row. Bug path.
  - L4475 `appendResultEvents`: success → `sidechainTracker.finishAll("completed")` (no-op when task protocol active); nothing closes declared still-running foreground rows. Failure → `finishAll("failed")`.
  - L4752 `flushPendingToolCalls` (interrupt path): maps pending tool calls canceled, then `this.sidechainTracker.clear()` — **drops legacy rows silently**; then `taskProtocolSource.cancelRunningForegroundTasks()` for task-protocol rows.
  - L2695 `close()`: `sidechainTracker.clear()` + `taskProtocolSource.reset()` — keep as is (agent-manager cancelRunningProviderSubagents covers close).
  - Tracker wired at L2085 with `getToolInput` off `toolUseCache`, `isDescriptorOwnedElsewhere: () => taskProtocolSource.isActive`.
  - `ToolUseCacheEntry` has `.name` (tool name) and `.input`; parent tool_use registered from assistant/stream_event blocks (`upsertToolUseEntry` L5506), deleted on tool_result.
- `subagents/live-source.ts`: `ClaudeTaskProtocolSource` — `declaredIds`, `backgroundedIds`, `lastStatusById`; `cancelRunningForegroundTasks()` (declared, non-backgrounded, last status "running" → "canceled" observations) is the model for the new success method.
- Test homes found: `agent.subagent-interrupt.test.ts` (open-query interrupt harness), `agent.sub-agent-sidechain.test.ts` (buildQueryMock event lists, streamSession, result messages), `subagents/live-source.test.ts` (unit).

## Plan

1. Interrupt: `flushPendingToolCalls` emits `finishAll("canceled")` instead of silent `clear()`. RED+GREEN in agent.subagent-interrupt.test.ts.
2. Success: new live-source method (beside `cancelRunningForegroundTasks`) marks declared, non-backgrounded, still-running tasks "completed"; call it in `appendResultEvents` success branch, dispatched like the cancel path. RED+GREEN in live-source.test.ts + agent.sub-agent-sidechain.test.ts.
3. Legacy gate: `translateSidechainFrameToEvents` skips `sidechainTracker.handleMessage` when the frame is on the legacy path AND the parent tool_use is not a Task/Agent(/Workflow) call per `isClaudeSubagentToolName(toolUseCache.get(parentToolUseId)?.name)`. RED+GREEN in agent.sub-agent-sidechain.test.ts.

## Status

- [x] Recon
- [x] Change 1 RED — new test `a legacy sidechain row is canceled with the turn that spawned it` in agent.subagent-interrupt.test.ts; failed as expected: statuses `[ 'running' ]` vs `[ 'running', 'canceled' ]` (silent clear drops the row). Other 2 tests in file pass.
- [x] Change 1 GREEN — `flushPendingToolCalls` now emits `sidechainTracker.finishAll("canceled")` events instead of silent `clear()`; interrupt suite 3/3 pass.
- [x] Change 2 RED — live-source unit tests (complete/idempotent/already-settled/backgrounded) failed: `completeRunningForegroundTasks is not a function`; agent-level success test failed: last status `running` vs `completed`.
- [x] Change 2 GREEN — `ClaudeTaskProtocolSource.completeRunningForegroundTasks()` beside the cancel path; dispatched in `appendResultEvents` success branch via `foldSubagentObservations`. live-source 52/52 + sidechain 6/6 pass.
- [x] Change 3 RED — `derives no provider subagent row from a non-subagent parent tool` failed with exactly the live evidence: upsert id toolu_mcp_wait_1, title "Claude subagent", status "running" (+ completed on turn success).
- [x] Change 3 GREEN — legacy path gated on `isClaudeSubagentToolName(toolUseCache.get(parentToolUseId)?.name)` in `translateSidechainFrameToEvents`; sidechain suite 7/7.
- [x] Gates:
  - vitest: 3 changed suites + adjacent claude subagent suites (background-subagent, sub-agent-replay, interrupt-restart-regression) — 6 files, 101/101 pass; post-format re-run of 3 changed suites 62/62.
  - `npm run typecheck`: only the known foreign error packages/app/e2e/browser/plugin-timeline.spec.ts(238,79) TS2554; nothing else.
  - `npm run lint --` (5 changed files): 0 warnings, 0 errors.
  - `npm run format:files --` (same 5): clean.

## Changed files

- packages/server/src/server/agent/providers/claude/agent.ts — interrupt emits finishAll("canceled"); success dispatches completeRunningForegroundTasks; legacy frame gate.
- packages/server/src/server/agent/providers/claude/subagents/live-source.ts — new completeRunningForegroundTasks().
- agent.subagent-interrupt.test.ts, agent.sub-agent-sidechain.test.ts, subagents/live-source.test.ts — 7 new tests (2 interrupt/sidechain agent-level, 1 success agent-level, 4 live-source unit).

Not committed, per brief. Session close path (agent.ts:2695) left as is. No protocol change. providers/pi untouched.
