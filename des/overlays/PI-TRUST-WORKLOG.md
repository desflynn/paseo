# PI-TRUST-WORKLOG — Pi `--approve` gating for Paseo-managed worktrees

Owner: Pi trust child (NARROWBODY, zai/glm-5.3-flash). Parent/reviewer: Paseo Fixer Guy.
Branch: `0.10.3-df`. **No commit** — parent reviews the working tree.
Owned files: `packages/server/src/server/agent/providers/pi/**` only (+ this worklog).

## Task

Pass `--approve` to Pi iff (1) agent cwd is inside a Paseo-managed git worktree
(under `$PASEO_HOME/worktrees`) and (2) the worktree's source checkout is
trusted in `~/.pi/agent/trust.json` per Pi's own matching rule. Otherwise
unchanged behaviour. Read-only on trust.json; never broaden trust.

## Facts established (recon)

- Pi launch argv built by `buildPiLaunch` → `appendPiLaunchArgs`
  (runtime.ts:81,116-144); `session.extraArgs` slot already spread at
  runtime.ts:124 but nothing fills it for Pi. Wiring point: `PiCliRuntime.startSession`
  (cli-runtime.ts:54) — fills `extraArgs` before `buildPiLaunch`. runtime.ts needs no change.
- Pi trust rule (dist/core/trust-manager.js):
  - File: `join(homedir(), ".pi", "agent", "trust.json")` (dist/config.js:432,455; CONFIG_DIR_NAME ".pi").
  - Shape: flat object, key = canonical dir path (realpath, fallback raw), value = `true|false|null`.
  - Match: normalize cwd (realpathSync, fallback raw), walk parents upward,
    **nearest** `true|false` entry wins; `null` entries skipped; none → decision falls to defaultProjectTrust.
  - CLI: `-a/--approve` trusts project-local files for one command; `-na/--no-approve` the inverse (docs/cli.md:225-227,276).
- Paseo worktree root: `resolvePaseoHome()` (paseo-home.ts:13; `PASEO_HOME` ?? `~/.paseo`) + `/worktrees`.
- Source checkout: `git -C <cwd> rev-parse --path-format=absolute --git-common-dir`;
  linked worktree ⇒ common dir is `<source>/.git` ⇒ source = `dirname(commonDir)`;
  main checkout ⇒ common dir == `<cwd>/.git` ⇒ not a worktree ⇒ null.
- Guard: skip when argv already carries `--approve`/`-a`/`--no-approve`/`-na`
  (custom provider profiles may already pass it — evidence file notes that workaround).
- `PiCliRuntime` constructed at agent.ts:1112 — new options optional ⇒ agent.ts untouched.
  FakePi (test-utils) bypasses cli-runtime ⇒ provider tests unaffected.

## Plan

1. ✅ Recon (this entry).
2. RED: tests in `cli-runtime.test.ts` (existing file) — 4 wiring cases + pure-fn cases.
3. GREEN: new `pi-project-trust.ts` (pure `shouldApprovePiProject` + nearest-decision
   walk + thin read-only trust reader + worktree-source resolver) + cli-runtime wiring.
4. Gates: `npx vitest run cli-runtime.test.ts --bail=1 > /tmp/pi-trust-test.txt`;
   `npm run typecheck`; `npm run lint -- <changed files>` (ignore known foreign
   error in packages/app/e2e/browser/plugin-timeline.spec.ts).
5. Final report to parent.

Progress: recon ✅ · RED ✅ · GREEN ✅ · gates ✅

## RED (2026-10-05)

- `cli-runtime.test.ts` extended: 4 wiring cases (trusted source → `--approve`; untrusted
  source → none; non-worktree trusted checkout → none; unreadable trust data → none,
  still starts) + 7 pure-fn cases for `shouldApprovePiProject` (self trust, ancestor
  trust, nearest-wins both ways, null-skip, plain-checkout guard, no-data guard,
  path-normalisation).
- RED run: `Cannot find module './pi-project-trust.js'` — suite failed as expected.

## GREEN (2026-10-05)

- **New** `providers/pi/pi-project-trust.ts`:
  - `shouldApprovePiProject({cwd, sourceCheckoutPath, trust})` — pure; false when no
    trust data, no source path, or source === cwd; else Pi's nearest-ancestor rule.
  - `findNearestPiTrustDecision` (private) — mirror of Pi `findNearestTrustEntry`:
    canonical dir (realpathSync, fallback resolve), walk parents, nearest `true|false`
    wins, `null` skipped.
  - `readPiTrustFile` — read-only reader of `~/.pi/agent/trust.json`; undefined on
    missing/unreadable/malformed; never writes.
  - `resolveManagedWorktreeSource` — null unless cwd (canonicalised) is under
    `resolvePaseoHome()/worktrees`; `git rev-parse --path-format=absolute
--git-common-dir`; null when main checkout (`<cwd>/.git`) or git fails; else
    `dirname(commonDir)`.
- `providers/pi/cli-runtime.ts` — optional `resolveWorktreeSource`/`readProjectTrust`
  options (defaults to the real impls; agent.ts:1112 construction untouched);
  `startSession` computes approval via `resolveProjectApprovalArgs` and fills the
  existing `extraArgs` slot before `buildPiLaunch` (runtime.ts untouched —
  `appendPiLaunchArgs` already spreads extraArgs at :124). `hasApproveFlag` guard
  skips when `--approve`/`-a`/`--no-approve`/`-na` already present (custom-profile
  workaround from evidence file). Try/catch: probe failure ⇒ unchanged behaviour.
- GREEN run: 33/33 (26 pre-existing + 11 new).

## Gates (2026-10-05)

- vitest cli-runtime.test.ts: ✅ 33/33 (re-run after format, still green).
- `npm run typecheck`: only known foreign error `packages/app/e2e/browser/plugin-timeline.spec.ts(238,79) TS2554`; server/cli packages clean.
- `npm run lint --` (3 changed files): 0 warnings, 0 errors.
- `npm run format:files` applied; footprint: `M cli-runtime.test.ts`, `M cli-runtime.ts`,
  `?? pi-project-trust.ts`. No commit (parent reviews). Nothing outside owned scope touched.

## Notes / unsure

- Default `readPiTrustFile` reads `~/.pi/agent/trust.json` literally (Pi's own
  homedir-based default). If a Pi deployment relocates its agent dir, the default
  would miss it — not possible to express today; injectable for future needs.
- `--path-format=absolute` needs git ≥ 2.31 (2021); older git ⇒ resolver returns
  null ⇒ no approval (safe default).
- Live worktree verification (real Pi child booting with the DCI extension in a
  fresh `$PASEO_HOME/worktrees` workspace) is the parent's next step; unit level
  is covered.
