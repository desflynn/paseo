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
- HOLD: Des deferred Paseo work to the host Pi upgrade. Do not carry further overlays or start a Paseo build until Pi Fixer Guy sends the explicit all-clear. Des asked to stop the helper and yeet current progress.

## State

- Existing checkout: /Users/des/dev/paseo, now on branch 0.11.0-df.
- Preserved 0.10.3-df is pushed to origin at d3bfe1c3e; local and remote heads match.
- Upgrade branch is based on upstream v0.11.0 (22488d450), with asset seed commit 5bc62547e. That commit carries all tracked des/, .agents/, .flight/, .claude/, .codex/ and .pi/ assets from preserved 0.10.3-df, leaving upstream core code unchanged.
- The seed was prepared using a temporary Git index, not a worktree. Plugin tree hashes were checked before and after the branch switch and match the preserved branch exactly.
- No 0.11 overlay implementation, dependency installation, or build has started. No new build process is running.
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
- 0.10.3-df preservation commits and branch-exit audit pushed through d3bfe1c3e.
- Main checkout switched safely to 0.11.0-df after seeding all plugin and harness assets. Tracked tree was clean before the pause journal update.
- FP-TESTER-3 recorded that October 1 UAT did not happen in /Users/des/dev/paseo-semantic-renderer-plugin/.flight/working-logs/FP-TESTER-3.md. It found no active flight lead; no flight-engine or live-plugin state changed.
- The aborted launch created Pi overlay helper 71100df6-c621-4faf-bfc5-a3129fe7ae2c. Cancelled, confirmed idle, and archived on Des's instruction. It only read patches/worklogs; no tracked or untracked source edits were left.
- Build hold acknowledged through Paseo to Pi Fixer Guy d11bb301-7d39-4239-9dd7-c3bc3799faf5. It recorded the hold and will send the all-clear after Pi verification.
- This agent id is 0ba29851-ef0e-4847-b014-99167dfb78f1 for an approved same-ID reload during the Pi installation.

## Branch-exit audit

- Preservation commits: 70e465d7e (spike and host regressions), 2f5bf38f3 (.agents/.flight and harness integration), 909cda1d6 (handoffs and upgrade records).
- Post-commit audit: zero tracked unstaged/staged changes, zero unclassified files. Remaining 21 untracked entries are local-only: 11 dated backups, six runtime hook/config files, three pre-upgrade snapshots, and one empty scratch handoff.
- One pre-existing stash (8b851b560, September 14, "df gitignore housekeeping pre-0.8.0") contains only the .gitignore addition for the old .a5c/ local runtime. No application/source work is hidden in it; no untracked stash parent. Retained untouched as historical local housekeeping, not port material.
- Plugin tree fingerprints on preserved 0.10.3-df: semantic-markdown debbbaaccc38fb1ac5f94520b12178fc59461d2e; render-probe 4695edcdc6b485b5a858fa280599fc275d3157e0; tool-results-spike 50670756ae3870d09090e2eb75d432cac09155be.
- Preserve these plugin trees/assets before changing checkout; the production plugin registry uses paths in this checkout.

## Pending

- Commit/push this pause journal and the asset seed to origin/0.11.0-df. This is preparatory preservation, not a verified 0.11 desktop build.
- Wait for Pi Fixer Guy's explicit all-clear. No polling wake or implementation/build work during the hold.
- After all-clear, reread this log and UPDATE-CHECK.md, then carry the eight required overlays in README order; retire ACP context-meter because upstream 48329facc is included.
- Assess the preserved tool-results-spike host/browser tests and local root guidance on 0.10.3-df for migration into the upstream core tree. Assets are carried, but these core-file candidates are not yet ported.
- Run npm dependency installation/allowScripts review, focused overlay and plugin compatibility tests, cross-package declarations/static gates, and root desktop build. Do not install or restart the production daemon.
- Footer copy/check interaction and MP3 desktop/phone checks remain unverified; do not claim owner/device UAT.
