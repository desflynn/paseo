# RELOAD-WAIT-WORKLOG — wait-during-reload + reload-caused error carry (0.10.3-df)

Child task from Paseo Fixer Guy (parent reviews). Evidence: /tmp/pi-rpc-reload-evidence.md
("Paseo FM child (diagnosis)" + "Paseo Fixer Guy — confirmed").
Owns ONLY: agent-manager.ts, session.ts + their test files. No commits. Daemon untouched.

## Progress

- [x] Recon: evidence read; sites confirmed.
  - BUG 1: `handleWaitForFinish` (session.ts:8166) — when agent not live it reads the
    stored record at once (session.ts:8188 area) and serves `lastStatus: "error"` with the
    pre-reload `lastError`. Reload keeps the agent out of the live map for its whole
    duration (`prepareAgentForClosure` agent-manager.ts:3693 deletes from `this.agents`).
  - Existing in-flight tracking: `lifecycleMutationTails` per-agent Map<string, Promise<void>>
    (agent-manager.ts:741), set by `runLifecycleMutation` (2290) — reload goes through it
    (1502). No public accessor → add smallest one: `waitForAgentReload(agentId)`.
  - BUG 2: `reloadAgentSessionInternal` captures `preservedLastError`/`preservedAttention`
    (agent-manager.ts:1522-1523) and re-registers with them (1593-1594). A "… process is
    closed" failure (jsonl-rpc-process.ts:149/226 produce `${diagnosticName} process is
closed`) is the reload closing the old process, not a genuine agent error.
  - Discriminator: message ends with "process is closed" (the brief's own signature; covers
    all jsonl-rpc providers without provider-name leakage). Cannot import from
    jsonl-rpc-process.ts — not in owned file set.
- [x] Worklog created.
- [x] RED tests written: (1) session.test.ts wait-during-reload; (2) agent-manager.test.ts
      accessor ordering; (3) agent-manager.test.ts reload-caused close error dropped;
      (4) genuine pre-reload error preserved (guard, expected green pre-fix).
- [x] RED run confirmed:
  - `waitForAgentReload resolves only after an in-flight reload settles` × TypeError:
    manager.waitForAgentReload is not a function.
  - `reload does not carry a process-closed error...` × reloaded.lastError still carried.
  - `wait_for_finish during an in-flight reload...` × no proper response served after gate
    release (pre-fix it errors out of the stored-record path immediately).
  - `reload still preserves a genuine pre-reload error` ✓ guard green pre-fix, as designed.
- [x] GREEN: BUG 1 accessor `waitForAgentReload` (awaits `lifecycleMutationTails` tail) +
      session.ts guard (await accessor when agent not live, re-check, then normal live/stored
      branches); BUG 2 `resolvePreservedFailureState` helper (drops "… process is closed"
      lastError + error attention at reload capture site). Helper extracted after oxlint
      complexity (24 > 20) on reloadAgentSessionInternal; `.then` returns value for
      promise/always-return.
- [x] GREEN run confirmed: 352/352 across agent-manager.test.ts + session.test.ts
      (/tmp/reload-fix-test-green2.txt).
- [x] Gates:
  - typecheck: only the known foreign error (packages/app/e2e/browser/plugin-timeline.spec.ts
    TS2554); zero errors in owned files (/tmp/reload-fix-typecheck3.txt).
  - lint on 4 changed files: 0 warnings, 0 errors (/tmp/reload-fix-lint2.txt).
  - oxfmt run on the 4 changed files; diff confined to intended changes
    (257 insertions, 2 deletions).

## Changed files (not committed — parent reviews)

- packages/server/src/server/agent/agent-manager.ts — accessor + BUG 2 helper + capture site
- packages/server/src/server/session.ts — wait-during-reload guard in handleWaitForFinish
- packages/server/src/server/agent/agent-manager.test.ts — 3 new tests
- packages/server/src/server/session.test.ts — 1 new test

## Notes for reviewer

- Discriminator is the message suffix "process is closed" (the brief's own signature;
  jsonl-rpc-process.ts produces `${diagnosticName} process is closed`). Not imported from
  jsonl-rpc-process.ts — that file is outside the owned file set.
- Only error-flavored attention is dropped alongside the reload-caused error; finished and
  permission attention pass through untouched.
- If the awaited reload FAILS (agent stays out of the live map), the wait falls through to
  the existing stored-record branch — the stale error then served is the honest state.
