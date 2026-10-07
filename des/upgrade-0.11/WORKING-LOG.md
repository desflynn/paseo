# Paseo 0.11.0-df upgrade

## Authority

- Des requested implementation and desktop build, not installation.
- Work must use a branch in the existing checkout, not a separate worktree.
- Des directed committing the pre-existing repo-owned dirty work to 0.10.3-df first. These changes are candidates for porting, not automatic ports.
- Des explicitly confirmed .agents/ and .flight/ are repo-owned and must be committed, including symlinks.
- Check for dangling project work before leaving 0.10.3-df.
- Des explicitly requires all live and spike plugin trees/assets to carry into 0.11.0-df; protect the daemon-served source paths during the branch switch.
- October 1 owner UAT did not happen. The pre-UAT report is not owner UAT.
- Never install an app or restart the production daemon during this preparation.

## State

- Existing checkout: /Users/des/dev/paseo, branch 0.10.3-df.
- Original fork-synced head: 0598fe903. Explicit git push confirmed everything up to date.
- Upgrade branch 0.11.0-df exists at upstream v0.11.0 (22488d450).
- The mistakenly created .dev/worktrees/0.11.0-df checkout was removed using the exact command approved by Des. The branch was kept.
- No stash, reset, clean, or source discard has been performed.
- Bead: paseo-98w, claimed.

## Preservation inventory

Repo-owned candidates to commit on 0.10.3-df:

- tool-results-spike implementation, behavioural tests, and worklogs.
- Its host-transformer and browser regressions in the existing app suites.
- .agents/ and .flight/ installation links; all targets resolve in this checkout.
- Harness command/skill aliases pointing to .agents/, including replacement of the old .claude/skills directory with its alias.
- CLAUDE.md project guidance and flight-plan routing.
- Existing upgrade worklogs, substantive handoffs, and 0.11 update-check report.

Local-only files excluded from project commits:

- Dated .bak-\* files (including the old skills-directory backup).
- Empty .claude/handoffs/2026-10-07-paseo-fixer-guy.md accidental scratch file.
- .codex/config.toml, .codex/hooks.json, .codex/hooks/ and .pi/mcp.json runtime configuration.
- des/upgrade-0.10.3/CLAUDE.before-upgrade.md, local-guidance.patch and plugin-trees.before: pre-upgrade snapshots, not current project changes.

Exclusion preserves these files on disk; nothing is deleted. Branch-exit audit must identify every remaining path and confirm no unclassified project change remains.

## Verification

- Existing tool-results-spike worklog records 91 plugin tests, plugin/repository typechecks, scoped lint, and 7 browser cases green. Do not rerun an already-reported-green browser suite unnecessarily.
- Candidate secret scan found zero obvious private keys, API-token patterns, or credential-bearing URLs. Symlink targets were not ingested.
- Scoped source formatting and lint passed; plugin typecheck passed.
- Repository typecheck initially failed (RED) at plugin-timeline.spec.ts:238: rewriteMcpMessage received an unused fifth argument, "text", although its signature accepts at most four arguments.
- Removed that ignored argument without changing the fixture behaviour. Repository typecheck then passed (GREEN); corrected file format/lint passed.
- No already-green browser suites were rerun.
- Spike committed as 70e465d7e. The format hook initially rejected a wrapped inline command in ROW-WORKLOG.md after formatting; a plain verification summary made the format/check stable. All spike commit hooks passed.
- Harness integration committed as 2f5bf38f3. Its format hook follows symlinks into externally owned shared sources. Manually formatted/checked both staged regular files, then excluded only the format job for that commit; lint/typecheck stayed enabled. Shared target content was not changed. A dated backup of .flight/claude-bridge-context.json was kept locally before formatting.

## Completed

- Original 0.10.3-df branch pushed/verified against fork.
- Dirty-tree inventory completed: six tracked changes and 99 untracked entries before this log.
- .agents/ and .flight/ symlinks checked: no missing targets.

## Pending

- Commit logical groups and push 0.10.3-df to the fork.
- Audit all leftovers; classify local-only files and ensure no project work dangles.
- Harvest the no-UAT clarification receipt from current FP-TESTER-3 (63858a9d-2c5a-43a5-850d-7a64e723edca); message delivered and pickup verified. Asked it to record the correction in the flight-owned log and relay to the current lead. No UAT/live activation authorized.
- Prepare all des/plugins trees/assets on 0.11.0-df before switching, then safely switch the main checkout without deleting live daemon-served plugin sources or losing remaining local-only files.
- Carry overlays in UPDATE-CHECK.md order, evaluate preserved candidates, run upgrade gates, and build desktop artifact.
- Footer copy/check interaction and MP3 desktop/phone checks remain unverified; do not claim owner/device UAT.
