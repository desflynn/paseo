# Pi overlay carry — 0.11.0-df (from v0.11.0)

## Authority

- Carry three Pi overlays behaviour-identically onto 0.11.0-df: pi-compaction-hold, pi-worktree-trust, pi-compaction-status. Preserve upstream 0.11 changes.
- Own ONLY: `packages/server/src/server/agent/providers/pi/{agent.ts,agent.test.ts,cli-runtime.ts,cli-runtime.test.ts,pi-project-trust.ts}`, `des/overlays/{pi-compaction-hold,pi-worktree-trust,pi-compaction-status}.patch`, this worklog. Parent owns all other files; Claude child owns providers/claude. fake-pi.ts is NOT owned — hold tests patch the FakePiSession instance instead, as before.
- No git add/commit/stash/reset/clean (shared index). No --3way/--index. Checked plain `git apply` restricted to my files. Hand-resolve test conflicts with precise edits, no bulk scripts, no .rej files.
- Tests only in the parent-assigned slot after deps settle; logs to /tmp; specific owned test files only. No plugin edits, live config, app build, or daemon changes. No commits.
- Regenerate each overlay as a clean per-overlay diff; pre/post snapshots in /tmp/pi-carry-snap/.

## State at start

- Branch 0.11.0-df at 7e289ff2f (v0.11.0 + asset-seed 5bc62547e + pause-journal 7e289ff2f; no core code changes). v0.11.0 confirmed ancestor; owned paths clean.
- UPDATE-CHECK.md verdicts: hold ✅ clean; trust ✅ clean (creates pi-project-trust.ts); status ⚠️ agent.ts clean, agent.test.ts conflict (upstream 1f8a4559a/97083dd73/5eb4c8afa/29c198f95/4417d7c47). Not superseded by any upstream fix.
- Anchor recon on 0.11: agent.ts — fields 1190-1192, startTurn prompt call 1297 (same shape), executeCompactCommand 1778, onUsage 1236, compaction_end case 2219, emitToolCallEvent 2285 → emitCompactionTimeline 2288. rpc-types.ts:195 compaction_end still `{reason?, errorMessage?, aborted?}`. agent.test.ts — FakePi import line 26, autocompact test 3057, compaction tests ~2946-3162. fake-pi.ts exports FakePiSession with compact/prompts/compactRequests/stats/finishTurn. All patch anchors present.

## Plan

1. Journal (this) → 2. Unit 1 hold (agent.ts + agent.test.ts) → 3. Unit 2 trust (cli-runtime.ts + cli-runtime.test.ts + new pi-project-trust.ts) → 4. Unit 3 status (agent.ts + agent.test.ts; depends on unit 1 in test file; hand-resolve the test hunk) → 5. Regenerate all three patches as clean per-overlay diffs → 6. Scoped lint/format on owned sources → 7. Report readiness for the focused-test slot to parent.

## Unit 1 — pi-compaction-hold

- [x] Applied clean via checked plain git apply (restricted to my two files): +126/−1, matches patch. manualCompactionSettled at agent.ts:1195; startTurn hold/drop at 1300-1302; executeCompactCommand settle in finally at 1804/1833.
- [x] Tests carried into agent.test.ts (holdPiCompaction gate helper + 3 tests, instance-patched, no fake-pi.ts edits).
- [x] Patch regenerated as clean diff; verified via `git apply --check -R` (exact delta vs HEAD).
- Result: DONE. Anchor recon held: 0.11 kept startTurn/executeCompactCommand shapes identical.

## Unit 2 — pi-worktree-trust

- [x] cli-runtime.test.ts + new pi-project-trust.ts applied from patch (restricted include). pi-project-trust.ts blob hash 3e5441e9e3… == patch index — byte-identical carry.
- [x] cli-runtime.ts hand-carried (patch hunk missed: 0.11 import members dropped inline `type` markers → whole-statement `import type`; 0.11 added createExternalProcessEnv line + 3-arg PiCliRuntimeSession(launch.env)). All five patch changes applied verbatim otherwise: trust import, two option fields, two class fields + ctor defaults, extraArgs-before-buildPiLaunch with conditional spread, resolveProjectApprovalArgs + hasApproveFlag. Upstream env wiring preserved untouched.
- [x] Patch regenerated (tracked diff + extracted new-file hunk); `git apply --check -R` clean.
- Result: DONE.

## Unit 3 — pi-compaction-status

- [x] Applied clean via checked plain git apply restricted to my two files, stacked on unit 1. The UPDATE-CHECK "test-only conflict" was against vanilla v0.11.0 — stacked on hold, all anchors exist (its hunk anchors on hold's inserted comment block). No hand-resolve needed.
- [x] agent.ts: AgentUsage import; latestContextUsage field (1204) captured in onUsage (1244); compaction_end → handleCompactionEnd (2244); handleCompactionEnd defined (2305) — failed/aborted auto → error assistant_message with `at X / Y tokens` from latest poller usage; protocol status stays loading|completed; manual failures not duplicated. rpc-types.ts:195 compaction_end type unchanged upstream — no type work needed.
- [x] agent.test.ts: 5 status tests landed at 3057-3149, before the hold comment block (3150) and hold tests — order matches intent.
- [x] Patch regenerated as clean post-hold→current diff (snapshots in /tmp/pi-carry-snap/post-hold); `git apply --check -R` clean.
- Result: DONE.

## Unit 4 — Pi MCP tool labels (candidate cde2d2d75, agent-only hunks)

Separate candidate, NOT one of the three overlays. Carry ONLY the two hunks of cde2d2d75 in my owned files: agent.ts live `metadata.toolDisplayName` passthrough (1 line, tool_call baseItem) + agent.test.ts emission regression ("emits MCP labels without changing tool identity"). Parent concurrently carries protocol display helper/test, extension contract/adapter/test, history mapper/test, browser regression. Keep the three overlay patches free of this; capture the delta separately in des/overlays/pi-mcp-labels.patch.

- Anchors on 0.11: agent.ts baseItem site 2473-2478 (same shape as candidate's pre-image); test anchor describe("PiRpcAgentSession") 434 → insert before "completes a turn and answers a dialog…" 435. Upstream changes preserved; no other hunks from the candidate taken.
- Dependency: full GREEN of the new test needs parent's adapter/contract pieces (mapping.displayName, name "paseo.list_agents"); until then the test is honestly RED at the label/name assertions. My one-liner alone is the live-emission passthrough half.
- [x] agent.ts passthrough carried (one line, baseItem site)
- [x] agent.test.ts regression carried ("emits MCP labels without changing tool identity")
- [x] pi-mcp-labels.patch cut from pre-label snapshot; three overlays still EXACT and label-free
- Verification: parent's adapter/contract pieces were already landed concurrently, so the carried test passed immediately; honest per-piece RED proven by hand-reverting ONLY the passthrough line → 1 failed with `name: "paseo.list_agents"` passing and `metadata.toolDisplayName` missing (exactly my piece's contribution, /tmp/pi-carry-label-red.log) → restored byte-exact (agent.ts b75ff3d6…). GREEN: agent.test.ts 127/127 (exit 0, /tmp/pi-carry-green2-agent.log), cli-runtime.test.ts 33/33 (exit 0, /tmp/pi-carry-green2-cli-runtime.log). Filtered pass with all pieces: /tmp/pi-carry-label-test.log.
- Patches: pi-mcp-labels.patch = exactly the two carried hunks (2-file diff vs pre-label snapshot; reverse-applies EXACT, also after format). Three overlay patches reverse-apply EXACT — untouched by the candidate, no label content in them.
- Scoped oxfmt/oxlint on agent.ts: exit 0, 0 warnings / 0 errors; formatter changed nothing (/tmp/pi-carry-format2.log, /tmp/pi-carry-lint2.log).
- Result: DONE.

## Verification

- End-to-end replay: pristine v0.11.0 copies of the 4 existing files in /tmp/carry-verify + all three REGENERATED patches applied in README order (hold → trust → status) → the five owned files byte-identical to the working tree. The regenerated patch stack replays the whole carry on a fresh 0.11 base.
- pi-project-trust.ts blob hash equals the original patch's index (3e5441e9e) — byte-identical carry.
- Scoped format (oxfmt via npm run format:files) + lint (oxlint via npm run lint) on the 3 owned sources: exit 0, 0 warnings, 0 errors; formatter changed nothing (all three patches still exact reverse-applies after). Logs: /tmp/pi-carry-format.log, /tmp/pi-carry-lint.log.
- Type spot-check: `AgentUsage` exported at agent-sdk-types.ts:216 with `contextWindowUsedTokens` / `contextWindowMaxTokens` — the status overlay's import and field reads are valid; no inferred-type patching done. Full typecheck deferred to parent's declaration build.
- Working tree: exactly 4 modified + 1 new file, all within ownership. No .rej files, no other paths touched.
- Focused tests: DONE in the parent-assigned slot (deps built). RED→GREEN on the new base; upstream tests and source never altered:
  - RED state: agent.ts set to its exact upstream 0.11 bytes (the whole diff vs upstream on that file is carried behaviour; tests stayed intact), and `shouldApprovePiProject` pinned to `return false` (pre-overlay = never approve). No branch/stash/reset/checkout; `git show HEAD:` + hand edit only.
  - RED agent.test.ts (filtered to the 8 carried tests): 7 failed / 1 passed — the pass is "reports an auto compaction as completed when no failure is reported", which asserts preserved upstream behaviour and correctly passes on upstream code. /tmp/pi-carry-red-agent.log
  - RED cli-runtime.test.ts (filtered to trust suites): 6 failed / 5 passed — the 5 passes are the negative guards (omit/never-approve cases) that correctly hold under pre-overlay behaviour. /tmp/pi-carry-red-cli-runtime.log
  - Restore: byte-exact from hashed snapshots (agent.ts 9dfe0647…, pi-project-trust.ts c77fb8cb…); all three regenerated patches again `git apply --check -R` EXACT after restore. Tree stat: 4 files, +473/−11, plus new pi-project-trust.ts.
  - GREEN full files: agent.test.ts 126/126 passed (exit 0), /tmp/pi-carry-green-agent.log; cli-runtime.test.ts 33/33 passed (exit 0), /tmp/pi-carry-green-cli-runtime.log. Prior 0.10.3-df reds were NOT cited as new-base proof.
- Patches: final state = the three regenerated clean per-overlay diffs verified before the test slot (replay on pristine v0.11.0 → byte-identical working tree; reverse-applies EXACT). No further regeneration needed — the RED/restore cycle was byte-perfect.

## Upstream-0.11 deltas encountered (all preserved)

- cli-runtime.ts: whole-statement `import type` (no inline type markers); `createExternalProcessEnv` env wiring in startSession; 3-arg `PiCliRuntimeSession(process, commandsRpcName, launch.env)` + environment getter. Overlay changes re-anchored around them; upstream lines untouched.
- agent.ts / agent.test.ts: upstream moved compaction code (fields ~1190, executeCompactCommand 1778, compaction_end case 2219, compaction tests ~2946-3162) but shapes matched the overlay intent; applied at the new sites. Upstream test additions preserved around the inserted blocks.

## Gates / blockers

- Carry + focused tests complete. Remaining gates are the parent's shared static/build gates. No blockers, no additional scope taken.
