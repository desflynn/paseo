# Overlays vs upstream v0.12.0 — update check (2026-10-21, report only)

Base checked: vanilla `v0.12.0` (`cafe4b01c`, "chore(release): cut 0.12.0"), detached worktree
`/tmp/paseo-v012-overlays`. Our tree: branch `0.11.1-df` at `/Users/des/dev/paseo` (untouched).
Our base: `v0.11.1`; upstream delta checked: `v0.11.1..v0.12.0`.

Method (follows `des/upgrade-0.11/UPDATE-CHECK.md`): one `git apply --check` per patch against the
vanilla worktree (nothing ever applied for real), plus `patch --dry-run` for offset detail.
Conflict causes read from `git diff v0.11.1 v0.12.0 -- <file>`. Every apply result below is
PROVED (ran it); supersession verdicts are grep/log-proved against the v0.12.0 worktree; the
add-commit history for one helper is marked NOT CONFIRMED.

## Results table (all 11 patches checked)

| #   | Overlay                    | Verdict                 | Detail                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | unsigned-macos-build       | ✅ APPLIES CLEAN        | 0 hunks fail, no offsets. `electron-builder.yml` mac block + root `package.json` allowScripts. Re-derive `allowScripts` versions after `npm install` on the 0.12 dep tree (README §1: reference only).                                                                                                                                                                                                                          |
| 2   | acp-context-meter          | 🗑 RETIRED UPSTREAM     | Fails (`acp-agent.ts` hunk 1/1 @ 3127) — and that is fine: upstream still ships its own fix. `handleUsageUpdate` pushes `contextWindowUsedTokens`/`contextWindowMaxTokens` at `packages/server/src/server/agent/providers/acp-agent.ts:3288-3302` in vanilla v0.12. Upstream fix `48329facc` is in v0.11.0 ⊂ v0.12.0 (`git tag --contains` → v0.11.0, v0.12.0 desktop betas). Same verdict as 0.11; do not apply.               |
| 3   | mine-label                 | ⚠️ CONFLICT (1 hunk)    | `session.ts` hunk @ 4175 fails: our `this.applyOwnerMineLabel(agent.workspaceId);` anchors after `agent = await this.createSessionAgent(msg);` — upstream changed that line to `({ agent } = await this.createSessionAgent(msg));` (@@ -4173,7 +4204,7) and restructured the create flow below it. Remaining 6 session.ts hunks + websocket-server.ts + session.test.ts anchor with fuzz/offset (GNU patch OK). NOT superseded. |
| 4   | pi-compaction-hold         | ✅ APPLIES CLEAN        | 0 hunks fail. Upstream `pi/agent.ts` delta v0.11.1..v0.12.0 is `thinking_level_changed` handling only (+11 lines, unrelated).                                                                                                                                                                                                                                                                                                   |
| 5   | sub-label                  | ⚠️ CONFLICT             | `paseo-tools.ts` 1/3 hunks @ 1500; `session.ts` 2/4 @ 4015 + 4185; `session.test.ts` end-append hunk (anchors on mine-label's own test block — stacking artifact). Pass: bootstrap.ts (2), schedule/service.ts + test, new `workspace-labels/sub-label.ts`. NOT superseded.                                                                                                                                                     |
| 6   | reload-wait                | ⚠️ CONFLICT (2 hunks)   | `session.ts` hunk @ 8207 (our `waitForAgentReload` guard before the live-map read) and `session.test.ts` end-append hunk (anchors on the SUB test block → stacking artifact). `agent-manager.ts` + `agent-manager.test.ts` apply clean. NOT superseded: no `waitForAgentReload` anywhere in vanilla v0.12 (`grep -rn` across `packages/server/src/server/`: no match).                                                          |
| 7   | pi-worktree-trust          | ✅ APPLIES CLEAN        | 0 hunks fail.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | pi-compaction-status       | ⚠️ CONFLICT (test only) | Only `pi/agent.test.ts` 1/1 hunk @ 3054 (upstream added ~42 lines of thinking-level tests in that file, displacing our anchor context). All `pi/agent.ts` hunks pass. NOT superseded: upstream still has no failed-auto-compaction surfacing (`grep "compaction failed"` in vanilla `pi/agent.ts`: no match).                                                                                                                   |
| 9   | claude-stale-subagent      | ⚠️ CONFLICT (1 hunk)    | `claude/agent.ts` 1/3 hunks @ 4336: our legacy-sidechain gate anchors on `return [...runtimeEvents, ...this.sidechainTracker.handleMessage(message, routedId)];` — upstream replaced that exact line with a `settledSubagentToolCalls` turnId reconciliation block (@@ -4336,7 +4488,12). Interrupt hunk @ 4629, third hunk @ 4920, `subagents/live-source.ts` + all test files pass. NOT superseded.                           |
| 10  | pi-mcp-labels              | ✅ APPLIES CLEAN        | 0 hunks fail.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11  | claude-auto-compact-window | ⚠️ CONFLICT (major)     | 8/9 hunks fail in `claude/agent.ts`. Upstream reworked everything our patch anchors on (detail below). `agent.test.ts` hunks pass. NOT superseded — worst rework of the set.                                                                                                                                                                                                                                                    |

## What upstream changed v0.11.1..v0.12.0 at each conflict

**session.ts agent-create region (mine-label @ 4175, sub-label @ 4015+4185)** — upstream reworked
agent creation: `createSessionAgent` now returns `{ agent }`; new `validatePublicAgentWorkspaceIntent`
(rejects `internal`, validates `background` vs workspace intent); new `normalizeAgentCreationGitOptions`
`gitIntent` threading; `CreatedAgent` return type; `background`/`callerWorkspaceId` fields;
`createAgentCommand` now returns `initialPromptStarted` (hunks @@ -4173 through -4290).
The label call sites survive conceptually — re-anchor `applyOwnerMineLabel` /
`applySubLabelForAgentTraffic` onto the new create/send flow. File: `packages/server/src/server/session.ts`.

**paseo-tools.ts @ 1500 (sub-label)** — upstream restructured `createPaseoToolCatalog` (~70 hunks);
at exactly our anchor it replaced the legacy `create_agent` placement block (43 lines → 12) and
switched errors to `PaseoToolInputError` (@@ -1442,30 +1542,21, @@ -1500,43 +1591,12).
Re-anchor the `maybeApplySubLabel` call after the reworked create path. File:
`packages/server/src/server/agent/tools/paseo-tools.ts`.

**session.ts send region @ 8207 (reload-wait)** — upstream reworked agent-message handling:
`sourceAgentId` threading (@@ -8088, @@ -8105) and `readSettledAgent` replacing the direct
`agentStorage.get` + internal check (@@ -8164,8 +8286,8). Our guard ("wait out a reload before
serving the stored record") must be re-anchored before the live-map read in the new
`readSettledAgent` shape — the stale-record hazard it fixes is exactly what this region still does.
File: `packages/server/src/server/session.ts`.

**claude/agent.ts @ 4336 (claude-stale-subagent)** — upstream added subagent tool-call settlement:
`settledSubagentToolCalls` turnId mapping now wraps the `sidechainTracker.handleMessage` call our
hunk anchors on. Upstream's new code does NOT gate legacy rows by subagent-tool name — our gate is
still needed. Note: vanilla already has `isClaudeSubagentToolName` (`agent.ts:2023`, used in the
task-notification fallback @ 4652); our patch only uses it, never defines it (grep: no
`+function` line) — no duplicate-definition risk on re-cut. When upstream added the helper to
vanilla: NOT CONFIRMED (empty `git log -S` on v0.10.3..v0.11.0 and v0.11.1..v0.12.0; present in
vanilla v0.11.1, grep count 2). Upstream is actively churning this area again — expect more drift.

**claude/agent.ts usage/auth (claude-auto-compact-window, 8/9 hunks)** — upstream:

1. `extractContextWindowSize(modelUsage)` → `extractContextWindowSize(modelUsage, modelId)`:
   per-active-model context window instead of max-over-all-models ("modelUsage accumulates every
   model used in the session… Only the active model describes this turn's context capacity").
2. `ClaudeContextUsageState` restructured (hunks @ 1946/1961/1973/1984/1996/2019/2044).
3. `resolveClaudeAuth` region reworked (@@ -1798,56 +1889,77) — our patch's largest hunk (+63 lines)
   anchors inside it.
4. New static `getClaudeContextWindowMaxTokens(modelId)` (`models.ts:51`): model-table lookup,
   `[1m]` suffix → 1_000_000. Used at `agent.ts:2315, 2647, 4913`.
   Upstream has NO configured auto-compact window resolution (`grep -rn "autoCompact|auto-compact"`
   in vanilla `packages/server/src/server/agent/providers/claude/*.ts`, non-test: no match) — the
   overlay's job (SDK env override → model setting → top-level setting, capped at the model window)
   must be re-implemented on top of the new model-keyed usage code. The new static helper does not
   read settings, so it does not cover us.

**pi/agent.test.ts @ 3054 (pi-compaction-status)** — end-append test block anchors displaced by
upstream's +42 thinking-level lines. File: `packages/server/src/server/agent/providers/pi/agent.test.ts`.

**session.test.ts end-appends (mine-label OK-with-offset; sub-label, reload-wait fail)** — stacking
artifacts: each overlay's test block anchors on the previous overlay's own test block, which does
not exist on vanilla. Regenerating per-overlay test diffs on the new base fixes this (same
patch-hygiene note as the 0.11 check).

## Retirement check summary

| Overlay                                                | Upstream ships the same fix?    | Evidence                                                                                                                         |
| ------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| acp-context-meter                                      | **YES — retire**                | `handleUsageUpdate` → `contextWindowUsedTokens/MaxTokens` in vanilla (`acp-agent.ts:3288-3302`); `48329facc` ∈ v0.11.0 ⊂ v0.12.0 |
| claude-auto-compact-window                             | No                              | no autoCompact anywhere in claude provider (non-test); static table helper only                                                  |
| reload-wait                                            | No                              | no `waitForAgentReload` in vanilla server tree                                                                                   |
| mine-label / sub-label                                 | No                              | no MINE/SUB auto-labeling; only the workspace-label RPC's own `setAssignment` (`session.ts:6538`)                                |
| pi-compaction-status                                   | No                              | no "compaction failed"/aborted surfacing in vanilla `pi/agent.ts`                                                                |
| pi-compaction-hold / pi-worktree-trust / pi-mcp-labels | n/a — apply clean, still needed | apply results above                                                                                                              |
| claude-stale-subagent                                  | No (partial overlap)            | `completeRunningForegroundTasks` not adopted (`git log -S`: none); sidechain gate absent; upstream helper reused, not our fix    |
| unsigned-macos-build                                   | Never (by design)               | README §1: local only                                                                                                            |

## Verdict

1. **4 apply clean on vanilla v0.12.0**: unsigned-macos-build, pi-compaction-hold, pi-worktree-trust, pi-mcp-labels.
2. **1 retires**: acp-context-meter — upstream's own ACP context-window fix still ships in 0.12; drop it again.
3. **6 conflict, none superseded**: mine-label + sub-label (session.ts create-flow rework + paseo-tools catalog rework), reload-wait (session.ts send region → readSettledAgent), pi-compaction-status (test file only), claude-stale-subagent (agent.ts:4336 — upstream's settledSubagentToolCalls replaced our anchor; our gate still needed), claude-auto-compact-window (8/9 hunks — biggest rework: re-implement the configured-window resolution on the new model-keyed usage code).
4. All apply results PROVED by `git apply --check` on the detached worktree `/tmp/paseo-v012-overlays` @ `cafe4b01c`; conflict causes from `v0.11.1..v0.12.0` file diffs; nothing was applied for real, no main-tree touch.
5. Patch hygiene from the 0.11 check still bites: sub-label/reload-wait test hunks anchor on each other's blocks — cut clean per-overlay patches on the new base when re-applying.
