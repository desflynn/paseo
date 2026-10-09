# Paseo 0.11.1-df preparation

## Authority and perimeter

- Des approved Q4A via popup: implement, verify, build, commit and push; do not install or restart the production daemon.
- Use a new branch in the existing checkout, not a worktree. Preserve current DF code, live/spike plugins, harness assets and classified local files.
- No inference/model boot, foreign repository source edits, automatic security sweep or live config edits as part of this upgrade.

## Basis and preservation

- Starting DF tip da4ae483d on 0.11.0-df; new branch 0.11.1-df starts at the same tip.
- Upstream v0.11.1 ab10a6694; 12 commits / 38 files over v0.11.0. Nine active patches passed read-only temporary-index preflight.
- Tracked checkout clean; 25 untracked paths are classified local backups/runtime/snapshots, no unclassified project code.
- Plugin tree hashes: semantic-markdown debbbaaccc38fb1ac5f94520b12178fc59461d2e; render-probe 4695edcdc6b485b5a858fa280599fc275d3157e0; tool-results-spike 50670756ae3870d09090e2eb75d432cac09155be.
- Installed app reports 0.11.0. Preserve it untouched throughout preparation.

## Release delta

- Claude long-tool heartbeat classification (#6308): complements our broader legacy gate.
- Client provider-subagent resync after reconnection (#6316): complements server foreground/legacy completion.
- Claude transcript lookup under another project directory (#6301).
- Haiku 5.5 catalogue, gated to Claude Code >=2.1.293.
- No external npm dependency version changes; workspace versions and Nix hash update. Previous 149 vulnerability findings are not resolved by this release.

## Done

- Owner approval and read-only release/carry assessment; bead paseo-jji claimed.
- New existing-checkout branch created without losing any assets or current DF commits. Live registry shows only this agent running in this checkout; other same-checkout seats idle/closed.
- Upstream merge prepared cleanly, with proper v0.11.1 ancestry, no conflicts. Fourteen package/lock config backups made before merge; three plugin trees unchanged.
- New-test RED proof: temporarily hand-reverted history resolution, Haiku entry and resync behaviour while keeping new tests. History, Haiku and resync fail for the expected missing behaviour. The new heartbeat case already passes through the broader DF legacy gate (8/8), proving overlap rather than manufacturing a failure.
- GREEN restoration verified byte-for-byte against merged-source snapshots. Full focused files pass: history 3/3, models 60/60, resync 21/21, Claude sidechain/interrupt/live-source 67/67 (151 unique cases). Logs: `/tmp/paseo-0111-red-*.log` and `/tmp/paseo-0111-green-*.log`.
- Isolated transcript import/restart integration 1/1 plus main Claude file 88/88 pass without sending a prompt (240 unique focused cases total).
- Dependency reconciliation and server/declaration build pass; root typecheck and scoped format/lint pass. Audit remains 149 findings (9 low, 46 moderate, 84 high, 10 critical), not automatically remediated.
- Regenerated unsigned and Claude patches; nine-patch replay against v0.11.1 reproduces 30 files byte-for-byte. Proof: `.dev/upgrade-0.11.1/replay-proof.txt`.
- Provider CLI file initially failed on its old assumption that at least one Codex model ID contains `codex`. Removed that incidental name assertion, retaining non-empty/GPT-family/unique-ID/detail checks; isolated full provider command file then passed.
- Initial browser launch used repository cwd rather than app cwd, so plugin fixtures resolved `/Users/des/des/plugins/...`. Five cases passed; corrected app-cwd rerun passed all seven failed tool-results cases (12 unique browser cases total). No product change made for the harness error. Fresh pre-cleanup wide/narrow screenshots inspected: readable table/cards and Inspect/Native/Raw controls. This is not device UAT.
- Pre-build live baseline: installed app 0.11.0; port 6767 listener PID 14814, parent 14811, started Thu 8 Oct 10:15:34 2026. Baseline retained in `.dev/upgrade-0.11.1/live-baseline.json`.

- Final post-test-edit root typecheck passed. Targeted CLI formatting/lint passed; 240 focused cases, full provider command file, 12 unique browser cases and static gates passed on this base. Unchanged plugin unit suites were not needlessly repeated; plugin trees, external dependencies and plugin SDK source are preserved.
- Root `npm run build:desktop` succeeded: app, DMG and ZIP prepared. App and packaged server report 0.11.1; nine carried/new runtime modules match freshly compiled checkout byte-for-byte. Initial checker used a single `server` path; corrected to the actual `dist/server/server` output layout, no build change needed.
- Post-format replay remains nine patches / 30 files / zero byte mismatches. Proof: `REPLAY-PROOF.txt` and `PACKAGED-MODULES.json`.
- Installed app remains 0.11.0; live listener PID/start/parent unchanged. No installation, production restart, inference request or agent reload performed.
- Strong secret scan found zero hits across 42 candidate paths before proof artifacts; commit includes only explicit release/carry/proof paths, not local backups or runtime files.
- Artifact sizes/hashes and live baseline are in `ARTIFACT-PROOF.txt`.

## Pending

- Commit/push the verified merge and update delivery state. No installation or daemon restart.

## Known gaps

- The 149 dependency vulnerabilities (including ten critical) remain unreviewed; this patch release changes no external dependency versions.
- October 1 owner UAT never happened. Footer copy/check, device MP3 and actual device/client reconnect checks are not claimed as passed.
- Older desktop/mobile renderers do not receive the client reconnect fix merely by updating the daemon.
