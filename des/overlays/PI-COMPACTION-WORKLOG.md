# PI-COMPACTION-WORKLOG

Bug: prompt submitted to Pi during manual `/compact` is rejected by Pi RPC ("Cannot submit a prompt while compaction …"). Fix: hold the prompt in the adapter until the compaction RPC settles, then deliver exactly once; cancel during hold = never deliver; failure still delivers (error already reported via timeline).

## 1. Recon (done)

- Read docs/providers.md (Pi = direct provider over `pi --mode rpc`; compaction is long-running, outside the 60s control-plane RPC timeout) and docs/testing.md (TDD vertical slices, determinism, real deps over mocks).
- `pi/agent.ts`: manual `/compact` runs out-of-band via `tryHandleOutOfBand` → `executeCompactCommand` (sets `outOfBandCompactionEmit`, awaits `runtimeSession.compact()`). `compaction_start`/`compaction_end` runtime events route through `emitCompactionTimeline` to the out-of-band emitter while it is set.
- Submission point: `startTurn` → async IIFE → `runtimeSession.prompt(...)`. No compaction awareness today → prompt hits Pi mid-compaction → Pi rejects.
- Existing state to reuse: `outOfBandCompactionEmit` marks a manual compaction in flight, but its clearing is conditional (events vs finally), so it is not a reliable settle signal. Adding one deferred promise field `manualCompactionSettled` resolved in `executeCompactCommand`'s `finally` (success or failure).
- Cancel: `interrupt()` already clears `activeTurnId` and emits `turn_canceled`; the held IIFE re-checks `activeTurnId !== turnId` after the wait and returns without delivering (same pattern as the existing error-path guard).
- Tests: fake-pi.ts is NOT owned; helper in agent.test.ts patches the instance `compact` with a gate promise (release/fail) via `pi.queueSessionSetup`. FakePiSession.emit/compactRequests/prompts are public; `finishTurn()` + `events.nextTurnCompletion()` complete a held turn.
- Files owned: pi/agent.ts, pi/agent.test.ts only. No commit.

Next: RED tests.

## 2. RED (done)

- Added `holdPiCompaction` helper (instance `compact` patch with release/fail gate) + 3 tests in `pi/agent.test.ts` after the existing compact tests:
  1. holds a prompt submitted during manual compaction until the compaction settles
  2. never delivers a prompt canceled while held by manual compaction
  3. delivers the held prompt after manual compaction fails (+ asserts the failure is reported out-of-band)
- RED run (`npx vitest run ... --bail=1 > /tmp/pi-compact-test.txt`): test 1 failed — prompt delivered during compaction (`prompts` = [hello during compaction]); bail stopped before tests 2/3. 1 failed | 99 passed.

Next: GREEN implementation.

## 3. GREEN (done)

- `pi/agent.ts`, 3 small edits:
  1. New field `manualCompactionSettled: Promise<void> | null` beside the out-of-band compaction fields.
  2. `executeCompactCommand`: creates the deferred before the RPC, resolves it and nulls the field in `finally` — settles on success or failure, so a held prompt delivers either way (the failure itself is already reported via the `[Error] Failed to compact context` timeline).
  3. `startTurn` IIFE: if a manual compaction is in flight, await its settlement before `runtimeSession.prompt`; after the wait, if `activeTurnId !== turnId` (interrupted during the hold) return without delivering — interrupt already emitted `turn_canceled` and reset state.
- No queue layer: single hold slot; a second concurrent prompt is still rejected by the existing `activeTurnId` guard. No changes outside the Pi provider.
- Test run: 112 passed (112) — 3 new + 109 pre-existing, no regressions.

Next: typecheck + lint.

## 4. Typecheck + lint (done)

- `npm run typecheck`: exit 2, only known foreign error (`packages/app/e2e/browser/plugin-timeline.spec.ts(238,79) TS2554`) — my files clean.
- Lint: 1 error on first run (`promise/always-return` in the test helper's `then()`), fixed with explicit `return undefined`; re-run: 0 warnings, 0 errors on both files.
- Re-ran the test file after the lint fix: 112 passed (112).

## Done

- Changed files: `packages/server/src/server/agent/providers/pi/agent.ts` (hold implementation), `packages/server/src/server/agent/providers/pi/agent.test.ts` (helper + 3 tests).
- RED → GREEN verified. No commit (as briefed).
