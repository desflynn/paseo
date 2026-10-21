# PI-COMPACTION-STATUS-WORKLOG

Fix: Pi `compaction_end` failure variants (errorMessage / aborted, no result) were
always recorded as a `completed` compaction timeline item. Branch `0.10.3-df`.
Scope: only `packages/server/src/server/agent/providers/pi/agent.ts` and
`agent.test.ts`. No commit (parent Paseo Fixer Guy reviews).

## 2026-10-05 — Step 1: Recon (done)

- Evidence: /tmp/pi-gpt-6.1-sol-compaction-evidence.md "Paseo findings" — confirms
  agent.ts:2170-2178 maps every compaction_end to status "completed"; Pi failure
  variant carries result undefined / aborted / errorMessage / willRetry.
- Protocol finding: `CompactionTimelineItem.status` is `"loading" | "completed"`
  only — no failure value (packages/protocol/src/agent-types.ts:346,
  packages/protocol/src/messages.ts:701). Per brief: DO NOT change the protocol.
  Plan: close the loading item with the existing completed emission, and surface
  the failure via an error-style assistant_message timeline item, matching the
  manual path's "[Error] Failed to compact context: <msg>" style (agent.ts:1765).
- Event type (rpc-types.ts:186, out of scope to edit): `{ type: "compaction_end";
reason?: string; errorMessage?: string; aborted?: boolean }` — no `result` or
  `willRetry` field exposed to Paseo, so failure detection =
  `errorMessage !== undefined || aborted === true`.
- Manual-path decision: for `reason === "manual"`, skip the extra error item — the
  compact RPC catch already emits "[Error] Failed to compact context: <msg>"
  (agent.ts:1765); emitting another would duplicate it with wrong wording. Auto
  only: "[Error] Auto compaction failed: <errorMessage>" or
  "[Error] Auto compaction aborted".
- willRetry decision: skipped — Paseo's compaction_end type doesn't carry it and a
  retried compaction that later succeeds would only have added timeline noise.
- emitCompactionTimeline (agent.ts:2239) bookkeeping verified: emitting the closing
  completed item keeps manual out-of-band state identical to before the fix.

## 2026-10-05 — Step 2: RED (in progress)

- Writing 3 tests in agent.test.ts compaction block (after the manual-RPC-rejects
  test, before the holdPiCompaction helpers):
  1. compaction_end auto, no failure fields -> loading + completed, no error item
     (unchanged-behavior guard; `result` is not visible to Paseo, absence of
     errorMessage/aborted is the observable success form).
  2. compaction_end auto + errorMessage -> error item
     "[Error] Auto compaction failed: summarizer request failed" (expected RED).
  3. compaction_end auto + aborted=true -> error item
     "[Error] Auto compaction aborted" (expected RED).
- Run: `npx vitest run packages/server/src/server/agent/providers/pi/agent.test.ts
--bail=1 > /tmp/pi-compact-status-test.txt 2>&1`.

## 2026-10-05 — Step 2: RED (done)

- 3 tests added to the PiRpcAgentClient compaction block in agent.test.ts:
  1. "reports an auto compaction as completed when no failure is reported"
     (compaction_end auto, no failure fields -> loading + completed, no error
     item; unchanged-behavior guard).
  2. "surfaces a failed auto compaction as an error timeline item"
     (errorMessage "summarizer request failed").
  3. "surfaces an aborted auto compaction as an error timeline item"
     (aborted: true).
- Run 1 (--bail=1): exit 1 — test 2 failed for the RIGHT reason: received only
  [loading auto, completed auto], missing the error item. Test 1 passed. 1 failed
  | 100 passed (115). RED confirmed.

## 2026-10-05 — Step 3: GREEN (done)

- agent.ts: compaction_end case now delegates to new private handleCompactionEnd:
  emits the closing completed compaction item (protocol has no failure status),
  then for failed AUTO compactions (errorMessage !== undefined || aborted ===
  true) emits an assistant_message timeline item "[Error] Auto compaction
  failed: <errorMessage>" or "[Error] Auto compaction aborted". Manual trigger
  returns after the closing item — the RPC catch already emits "[Error] Failed
  to compact context: <msg>"; no duplication, manual behavior byte-identical.
- First GREEN attempt slipped: failure guard dropped, so successful auto
  compactions got an error item too — caught by test 1, fixed by adding `failed`
  guard. TDD did its job.
- Run 2 (--bail=1): exit 0 — 115/115 passed.

## 2026-10-05 — Step 4: Gates (done)

- `npm run typecheck`: exit 2, but the ONLY error is the known foreign one
  (packages/app/e2e/browser/plugin-timeline.spec.ts(238,79) TS2554) — ignored per
  brief. No errors in changed files.
- `npm run lint -- pi/agent.ts pi/agent.test.ts`: 0 warnings, 0 errors.
- Footprint: only pi/agent.ts (+45) and pi/agent.test.ts (+45) changed by this
  session; all other dirty files in the repo pre-existed (other agents' work,
  untouched). Nothing committed.

DONE: RED then GREEN, gates clean. Awaiting parent review.

## 2026-10-05 — Follow-up Step 1: Survey for token figures on compaction failure (done)

- Brief: extend 4e9ffeaaa's error lines with context fullness, e.g. "[Error] Auto
  compaction failed at 341,200 / 353,400 tokens: <msg>". No protocol change.
- compaction_start/compaction_end carry NO token fields (rpc-types.ts:194-195:
  compaction_end is reason?/errorMessage?/aborted? only) — tokensBefore does not
  exist. So the source is the adapter's latest known usage.
- PiUsagePoller keeps lastUsage private with no getter; the adapter's onUsage
  callback (agent.ts:1177) only re-emits usage_updated and stores nothing. Fix
  shape: store the latest published usage in a new private field on
  PiRpcAgentSession, read it in handleCompactionEnd. usage-poller.ts untouched.
- Tests: 4e9ffeaaa's three at agent.test.ts:2927-2967 stay as the no-usage
  regression guard (they assert today's text). Two new RED tests: failed and
  aborted with known usage (fed via fakeSession.stats + ManualUsagePollScheduler,
  same harness as the usage_updated tests at :2096).

## 2026-10-05 — Follow-up Step 2: RED (done)

- Added two tests after the aborted test in pi/agent.test.ts: "includes the known
  context usage in a failed auto compaction error" and "...an aborted auto
  compaction error", both feeding stats via fakeSession.stats +
  ManualUsagePollScheduler + one poll mid-turn, then emitting
  compaction_start/compaction_end. 4e9ffeaaa's three tests untouched as the
  no-usage guard.
- Run 1 (--bail=1): exit 1 — failed-with-usage test failed for the RIGHT reason:
  received "[Error] Auto compaction failed: summarizer request failed", missing
  the figures. RED confirmed.

## 2026-10-05 — Follow-up Step 3: GREEN (done)

- agent.ts: imported type AgentUsage; new field latestContextUsage
  (AgentUsage | null) on PiRpcAgentSession; onUsage callback stores the latest
  published usage before re-emitting; handleCompactionEnd builds a usageSuffix —
  both used+max known: " at X / Y tokens"; used only: " at X tokens"; else "".
  Applied to both failed and aborted auto texts; unknown figures keep today's
  text byte-identical. Numbers via toLocaleString("en-US") → 341,200 / 353,400.
  usage-poller.ts and protocol untouched.
- Run 2 (--bail=1): exit 0 — 117/117 passed (115 old + 2 new).

## 2026-10-05 — Follow-up Step 4: Gates + footprint (done)

- Lint caught the nested-ternary usageSuffix (oxlint no-nested-ternary); refactored
  to if/else, re-ran: test file 117/117 (exit 0), lint 0 warnings 0 errors.
- `npm run typecheck`: exit 2, ONLY the known foreign error
  (e2e/browser/plugin-timeline.spec.ts(238,79) TS2554) — ignored per brief.
- format:files on the two files: already clean.
- Footprint: this session changed only pi/agent.ts (+19/-2), pi/agent.test.ts
  (+48), and this worklog. Other dirty files (CLAUDE.md, upgrade WORKING-LOG,
  plugin-timeline.spec.ts, timeline/model.test.ts, deleted .claude skills,
  .agents/commands/) pre-existed — untouched. Nothing staged, nothing committed.

DONE: token figures on auto-compaction failure lines, RED→GREEN, gates clean.
Awaiting parent review.
