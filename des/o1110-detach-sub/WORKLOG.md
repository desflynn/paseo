# O1110 deploy journal — detach clears SUB (commit b19e24043)

Working log, kept as the deploy runs. Owner: 👨‍🔧Paseo Fixer Guy.
Relay: 🧔‍♂️Global Persona Guy (Des's GO received via dci task).

## State

- HOLD confirmed by GPG (choice b): do not fire while the Plugin Enhance Build flight is
  airborne. Payload, hashes and rollout script stay staged and untouched. GPG signals when the
  flight lands or Des pauses it; until then change nothing, push nothing, send nothing —
  unless the installed archive hash moves off b747e6ca (payload stale).
- Backstop wake 539a599e deleted (2026-10-11 ~19:00 IST); chip cleared; GPG's signal wakes me.

## ON SIGNAL (the runbook, stands alone)

1. Fire detached: `nohup sh /Users/des/dev/paseo/des/o1110-detach-sub/authorized-rollout.sh > /tmp/o1110-rollout-nohup.log 2>&1 &` then END TURN — my seat dies with the daemon; the script sleeps 20s, hash-guards (installed must be b747e6ca, payload 0607733d), quits Paseo, stops the daemon, backs up to app.asar.bak-o1110-detach-sub-<ts>, swaps, verifies, auto-rolls-back on failure, reopens Paseo, writes .dev/o1110-detach-sub/rollout-result.txt.
2. On relaunch: read rollout-result.txt; verify installed hash = 0607733d and daemon healthy.
3. Live smoke (GPG's step 4): launch a throwaway agent ALONE in a fresh workspace via the live daemon; confirm SUB while a sub; `paseo agent detach <id>`; confirm SUB gone; archive agent + workspace. Report SUB state before/after verbatim.
4. dci_instruct kind done to GPG: test counts (detach 4/4, SUB 6/6 filters), how restarted, what running agents did, smoke output.
5. Never push the branch; never resume agents/schedules myself.

## Step 1 — test counts (done)

- `vitest run src/server/session.test.ts -t "detach"`: 4 passed | 155 skipped (159 total), exit 0.
  Cases: detaches a stored subagent; detaching alone clears SUB; detaching in occupied workspace does not clear SUB; (+1 matching "detach" elsewhere in file).
- `vitest run src/server/session.test.ts -t "SUB"`: 6 passed | 153 skipped, exit 0.
  Cases: 4 SUB-overlay creation tests + the 2 new detach cases.

## Step 2 — restart impact (evidence, done)

- Live daemon: pid 64697 "Paseo Daemon", started Oct 10 17:49, child of "Paseo Supervisor" 76512.
- Daemon's direct children include every agent runtime: 20+ `pi` and `claude` CLI processes.
- docs/agent-lifecycle.md:101 — daemon shutdown path "Close the runtime (kills the process if
  still running)"; :125 shutdown drains before releasing runtime ownership.
- Live flight confirmed running at check: SUPER-SH-2 5987fa07-65e4-46aa-9823-15add8fdc226,
  WORKER-SH-1 3e048e85, WORKER-SH-2 6ee0548f (spawned minutes before check), cwd ~/dev/paseo-plugins;
  plus dci-harness seat 79f2e9c5 running.
- Verdict: a daemon restart KILLS running agent processes (sessions persist; interruption is real,
  mid-turn work breaks). No hot-swap path exists (`paseo reload` is config-only).

## Step 3 — payload prepared (done)

- Branch fix/detach-clears-sub @ b19e24043; lineage verified: 0166bcdd5 (installed payload
  source) is an ancestor; session.ts on 0.11.1-df last changed 09bde0ff7 (10-08, pre-build);
  branch delta vs 0.11.1-df = exactly the 2-file O1110 fix (144 insertions).
- `npm run build:server` exit 0; dist session.js contains fix string.
- Surgical asar patch (clone of claude-auto-compact-window patcher) appended session.js:
  - source (installed) sha256 b747e6ca1c6afa918533625b3a5c6d54db7dc81f0a1d31583f73396f96004329
  - payload .dev/o1110-detach-sub/backend-only.asar sha256 0607733d9d9165c038864ec62f6576bd5ac5e448d5d6801f7e6413722dcb46ae
  - changedFile node_modules/@getpaseo/server/dist/server/server/session.js
  - replacement f22687cedb341f0e985e7c4bbc64fbde77eaa3330f448671e5ce82728e88f685
  - assertions: extracted target == replacement; non-target header metadata identical; original
    packed bytes unchanged; installed archive unchanged.
- Independent check: fix string in installed session.js = 0 hits; in payload session.js = 1 hit.
- Staged: des/o1110-detach-sub/authorized-rollout.sh (hash-guarded, backup + auto-rollback +
  result file; NOT executed). Unpacked symlink in place.

## Step 4 — live smoke (pending restart)

## Step 5 — done report to GPG (pending)
