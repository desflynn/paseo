# CLAUDE-STALE-SUBAGENT — 0.11.0-df carry worklog

Carrying overlay 9 (`des/overlays/claude-stale-subagent.patch`) from 0.10.3-df onto 0.11.0-df
(v0.11.0 + asset seed). Owns only: claude/agent.ts, agent.sub-agent-sidechain.test.ts,
agent.subagent-interrupt.test.ts, subagents/live-source.ts, subagents/live-source.test.ts,
this worklog, and the regenerated patch. Parent owns sessions/build config; a sibling owns
providers/pi. No commits, no shared-index git mutations, no daemon/app actions.

## Recon (2026-10-08, before any edit)

- Branch `0.11.0-df` at 7e289ff2f; tracked tree otherwise clean (other agents' untracked
  scratch untouched).
- UPDATE-CHECK verdict for overlay 9: sources clean (`agent.ts`, `subagents/live-source.ts`,
  `agent.sub-agent-sidechain.test.ts`); conflicts only in `agent.subagent-interrupt.test.ts`
  and `subagents/live-source.test.ts`, both moved by upstream 8ddeb79c8 (#6295).
- #6295 ("background helpers stay idle; send/Stop no longer kills them") reviewed:
  - live-source.ts: `is_backgrounded` added to `task_started` (spawn-time background flag),
    background tracking unified in new `recordBackgrounded()`; `cancelRunningForegroundTasks`
    and `failRunningTasks` unchanged in shape. The overlay's `completeRunningForegroundTasks()`
    slots between them unchanged — it already skips `backgroundedIds`, so backgrounded helpers
    (spawned or moved) still outlive the turn. **No background-survival regression.**
  - agent.ts: all three overlay sites survive verbatim — legacy gate lands after `routedId` in
    `translateSidechainFrameToEvents` (~L4329), success completion after `finishAll("completed")`
    in `appendResultEvents` (~L4626), interrupt cancel replacing `sidechainTracker.clear()` in
    `flushPendingToolCalls` (~L4918, cancel-path comment intact).
  - agent.subagent-interrupt.test.ts: #6295 added "a child spawned in the background is not
    canceled with the turn that spawned it" at the same anchor the overlay used (before "a
    foreground child is canceled…"). Carry = both tests, overlay's after upstream's.
  - live-source.test.ts: #6295 added three spawn-time-background cancel tests at the same
    anchor. Carry = both sets, overlay's after upstream's, before "still routes a backgrounded
    subagent that settles after the interrupt".
- Behaviour preservation check against the new flow:
  1. Interrupt → `finishAll("canceled")` only touches legacy sidechain rows, which exist only
     when the CLI does not announce tasks (old CLI). New-CLI background helpers are task-protocol
     rows, skipped by `cancelRunningForegroundTasks`. Presentational change only; survival logic
     untouched.
  2. Success → `completeRunningForegroundTasks()` completes declared, non-backgrounded,
     still-"running" task-protocol rows only. #6295's spawn-time `is_backgrounded` feeds
     `recordBackgrounded`, so a spawn-backgrounded helper is never completed. Background
     routing table deliberately not reset (comment preserved).
  3. Legacy gate → frames routed to the legacy tracker only under `isClaudeSubagentToolName`
     (Task/Agent/Workflow) parent tool calls; MCP frames (dci wait_for_agent etc.) no longer
     materialize nameless stuck rows. Composes with #6295's `announcesTasks` early return.
- Overlay's carried tests remain valid on the new flow: the success test sends `task_started`
  with no `is_backgrounded` → foreground → completed; the legacy interrupt test sends init
  first, satisfying #6295's init-opens-turn rule.

## Plan

1. `git apply --include` the three clean files from the stored patch (plain apply, no
   --3way/--index, owned paths only).
2. Hand-anchor the overlay tests into the two conflicting test files, below #6295's new tests.
3. Scoped format/lint on owned files.
4. Regenerate `des/overlays/claude-stale-subagent.patch` as a clean per-overlay diff vs
   v0.11.0; verify with the README's temp-index check.
5. Run the three owned test suites only when the parent grants the test slot and deps are
   installed; logs to /tmp. Journal readiness below until then.

## Status

- [x] Recon
- [x] Apply + anchor — `git apply --include` landed agent.ts, live-source.ts and
      agent.sub-agent-sidechain.test.ts cleanly from the stored patch (150 insertions, no fuzz).
      Hand-carried the overlay tests into the two #6295-moved files: "a legacy sidechain row is
      canceled with the turn that spawned it" after upstream's background-spawn interrupt test;
      the three `completeRunningForegroundTasks` unit tests after upstream's three
      spawn-background cancel tests. All helpers used exist in both files. Diff vs v0.11.0:
      5 files, 240 insertions, 1 deletion.
- [x] Gates — scoped lint 0 warnings / 0 errors on the 5 owned files; scoped oxfmt stable.
- [x] Patch regenerated — `git diff v0.11.0 -- <5 owned files>` →
      `des/overlays/claude-stale-subagent.patch` (310 lines, clean per-overlay diff, no stacked
      foreign lines, no commit header). Verified with the README temp-index check:
      `GIT_INDEX_FILE=… git read-tree v0.11.0` + `git apply --cached --check` → clean.
- [x] Test slot run — RED/GREEN demonstrated, see below.

## RED/GREEN (parent slot, 2026-10-08)

Method: hand-reverted only my own carried source (three agent.ts behaviours + the
live-source method; `git diff v0.11.0` on both files → empty, i.e. bare upstream) while the
new tests stayed in place. No stash/branch/checkout, no foreign edits.

- RED `/tmp/claude-carry-RED.log`: 6 failed / 60 passed of 66 — exactly the six new overlay
  tests: legacy interrupt cancel; non-subagent-parent gate; success terminalizes Task row;
  and the three `completeRunningForegroundTasks` unit tests. Every upstream test stayed
  green, including all #6295 background-helper regressions.
- Restore: re-applied my own patch to the two source files (240/1 again).
- GREEN `/tmp/claude-carry-GREEN.log`: 3 files, 66/66 pass — interrupt 4 (3 upstream + 1
  carried), sidechain 7 (5 + 2), live-source 55 (49 + 3 upstream #6295 + 3 carried).
  Background survival green: spawn-backgrounded and moved-backgrounded children not canceled
  or completed; backgrounded child settling after interrupt still routes.

## Changed files

- packages/server/src/server/agent/providers/claude/agent.ts — legacy frame gate under
  `isClaudeSubagentToolName`; success branch dispatches `completeRunningForegroundTasks`;
  interrupt `flushPendingToolCalls` emits `finishAll("canceled")` instead of silent `clear()`.
- packages/server/src/server/agent/providers/claude/subagents/live-source.ts — new
  `completeRunningForegroundTasks()` beside the cancel path (skips `backgroundedIds`).
- agent.sub-agent-sidechain.test.ts (+2), agent.subagent-interrupt.test.ts (+1),
  subagents/live-source.test.ts (+3) — carried tests, anchored below #6295's new tests.
- des/overlays/claude-stale-subagent.patch — regenerated clean vs v0.11.0.
- des/upgrade-0.11/CLAUDE-CARRY-WORKLOG.md — this log.

No commits. No protocol change. providers/pi untouched. Parent owns sessions/build config.
