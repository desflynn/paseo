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
- The host Pi hold is RELEASED after Des's Pi 1.0.4-df installation and independent verification. Resume the authorized Paseo carry-forward/build. Des subsequently authorized the Large4 picker addition and config-only reload; that bounded operation is complete. No further live config change, agent reload, app installation, or daemon restart is authorized.

## State

- Existing checkout: /Users/des/dev/paseo, now on branch 0.11.0-df.
- Preserved 0.10.3-df is pushed to origin at d3bfe1c3e; local and remote heads match.
- Upgrade branch is based on upstream v0.11.0 (22488d450), with asset seed commit 5bc62547e. That commit carries all tracked des/, .agents/, .flight/, .claude/, .codex/ and .pi/ assets from preserved 0.10.3-df, leaving upstream core code unchanged.
- The seed was prepared using a temporary Git index, not a worktree. Plugin tree hashes were checked before and after the branch switch and match the preserved branch exactly.
- All eight required overlays are carried, plus the existing Pi MCP friendly-label candidate. Dependency installation, declarations, static/plugin/browser gates and root desktop build passed. Artifacts are prepared, not installed. Delivery commit 09bde0ff7 is pushed to origin/0.11.0-df and verified 0/0; tracked tree is clean.
- The mistakenly created .dev/worktrees/0.11.0-df checkout was removed using the exact command approved by Des. The branch was kept.
- No stash, reset, clean, or source discard has been performed.
- Bead: paseo-98w, claimed.

## Preservation inventory

Repo-owned candidates committed on preserved 0.10.3-df:

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

## Completed carry-forward helpers

- Pi helper 6f12c7ef-a55e-4d3c-8456-09580b20ff2c, Pi/ZAI GLM-5.3-Flash high, carried hold/trust/status and the separate live MCP label hunks. New-base RED proofs and full GREEN: agent 127/127, runtime 33/33. See PI-CARRY-WORKLOG.md. No child commits or shared-index mutations.
- Claude helper 421917c5-1844-45e2-94da-e608a33841d0, Pi/ZAI GLM-5.3-Flash high, carried stale-row handling while retaining upstream background-helper survival. New-base RED 6 failures/60 passes; restored GREEN 66/66 across three owned files. See CLAUDE-CARRY-WORKLOG.md. Harvested and archived.

## Overlay carry progress

- Unsigned macOS build: patch applied cleanly after dated package/electron-builder backups. npm install completed (4 added, 1 removed; 2688 packages audited). All 13 resolved install-script versions are explicitly approved; no obsolete approvals. Lockfile backup retained locally.
- npm audit summary: 149 vulnerabilities (9 low, 46 moderate, 84 high, 10 critical). No audit-fix sweep or extra dependency changes; review required before any later installation/release.
- Shared protocol/client/highlight/plugin/relay declaration build passed; log /tmp/paseo-011-server-deps.log.
- MINE: carried tests first; RED confirmed missing owner workspace assignment. Source applied cleanly; focused owner-label tests GREEN 4/4. Logs /tmp/paseo-011-mine-red.log and /tmp/paseo-011-mine-green.log. Regenerated clean patch against v0.11.0; pre-SUB baseline tree ae2b83c05cfbd49c317d346132221f1460020dfa.

- SUB: new-base tests RED before source; combined MINE/SUB/schedule label slice GREEN 9/9. Clean SUB delta captured after MINE. Logs /tmp/paseo-011-sub-red.log and /tmp/paseo-011-labels-green.log.
- Reload-wait: tests first, RED missing waitForAgentReload; source then GREEN 4/4, including real-error preservation. Logs /tmp/paseo-011-reload-red.log and /tmp/paseo-011-reload-green.log. Clean delta captured after SUB.
- ACP context-meter retired for this base: upstream 48329facc is included. Historical patch retained, never applied.
- Root guidance and spike host/browser tests carried cleanly. Host regression initially RED exposed an omitted existing candidate: cde2d2d75 Pi MCP friendly labels. Carried display helper, adapter, history, live emission and browser regressions; one history-test anchor conflict hand-resolved with both upstream custom-message and carried MCP cases retained. Parent label suites GREEN 39/39; rebuilt client, host suite GREEN 8/8. No wire schema changed; metadata override remains optional.
- Server/CLI build GREEN: /tmp/paseo-011-server-build.log, exit 0. Shared declarations refreshed before diagnosing cross-package types.
- All nine active patches replay onto pristine v0.11.0 and reproduce 30 carried files byte-for-byte, also after scoped formatting. Normalized the helper's two short old-file headers before integrating the full MCP label patch. Proof /tmp/paseo-011-overlay-replay-proof.txt. No source mismatch.
- Final parent suites GREEN: session 157/157, schedule 61/61, agent-manager 196/196 (414 total). Root and semantic-plugin typecheck GREEN; scoped format on 38 regular owned files and source lint GREEN, zero warnings/errors. Symlink targets untouched.
- Plugin compatibility on the new SDK: semantic tests 153/153; tool-results spike 80/80; render-probe typecheck GREEN. Build/test outputs leave all tracked plugin assets byte-identical to preserved source; no live plugin reload.
- Browser compatibility GREEN 8/8: wide/phone raw inspection, streamed MCP-shaped rows, failed/canceled grouped history and server/action badges. Initial launch failure was missing cached browser revision 1208, not rendering; reused installed headless Chromium 1234 through an ignored temporary config. No browser installation or production profile. Log /tmp/paseo-011-browser-reuse.log.
- Two inspection cases repeated only for visual proof. Runner end-of-test captures occurred after fixture cleanup and showed unavailable workspaces; rejected as proof. The existing test already writes valid pre-cleanup /tmp/tool-results-spike-1100.png and /tmp/tool-results-spike-390.png; both inspected. Wide table and readable stacked phone cards confirmed. No test source change. Temporary-config original snapshot retained as playwright.config.ts.bak-20261007; backup was made after the capture-only edit, a procedural miss.
- Tool-results spike typecheck also GREEN. Focused unit/plugin total: 920 unique cases, plus eight unique browser cases; subset/visual reruns are not counted again.

## Large4 side task

- Des authorized appending only mistral/mistral-large-4 to the live Pi picker. Config backup: /Users/des/.paseo/config.json.bak-20261007-large4. Existing 17 entries and every other field proved unchanged; live catalogue now 18, Off/High only, High default.
- Config-only reload succeeded with appliedPaths=[agents.providers], restartRequiredPaths=[]. No inference, daemon restart, app installation, or unrelated agent reload.
- Pi-owned effective proof independently read: context 400000, inputs text+image, reserve 50000, boundary 350000 verified; inherited key absent but real resolver succeeds; inferenceRequests=0. Proof /tmp/pi-large4-effective-proof.json; activation returned to Pi Fixer Guy with pickup confirmed.
- Des asked Global Persona Guy to classify this exact model as NARROWBODY in Fleet Doctrine/personas. Sent to 55e52eca-65c9-486a-bf2f-3dc49b861f11; pickup confirmed. Guy owns completion; no polling or runtime changes requested.

## Build and artifact proof

- Root npm run build:desktop GREEN; log /tmp/paseo-011-desktop-build.log. Unsigned arm64 app: /Users/des/dev/paseo/packages/desktop/release/mac-arm64/Paseo.app. CFBundleShortVersionString and packaged server version both 0.11.0; DF identity is the branch/carry, not an invented package version.
- App ASAR modules for session, agent-manager, Pi agent/runtime/trust and Claude agent match checkout compiled outputs byte-for-byte. Package build pruned native modules from 312.6 MB to 91.5 MB.
- DMG: 185152048 bytes; SHA-256 cc69fa3db6d1c101877b7488b60ed1b9ef55a6f56eeb297d443c19561e0ca3f5.
- ZIP: 179055444 bytes; SHA-256 bb34706f0d9ee9a27a97d09ef4d356b05eeadb31955a827eb906ef9d3aaf11c1.
- Live non-interference: installed /Applications/Paseo.app remains 0.10.3. Supervisor PID 1385 and listener/daemon child PID 1398 both started October 5. Earlier summary conflated supervisor and listener; corrected by ps/lsof, not assumed. No install or daemon restart.
- Python plistlib failed against the host XML library; used native PlistBuddy instead. No host dependency repair.

## Delivery

- Upgrade commit 09bde0ff7 pushed to origin/0.11.0-df; local/remote divergence 0/0 and tracked tree clean. Exactly 47 reviewed regular paths staged, no foreign files. Strong secret scan found zero hits. Format/lint/typecheck commit hooks all passed.
- Bead paseo-98w closed in the local durable tracker. Its auto-export could not stage ignored .beads; no force-add or ignore change. This note records delivery after the source commit.

## Pending

- Prepared app/artifacts remain local and uninstalled. Des owns any later installation decision. Global Persona Guy owns the dispatched Large4 NARROWBODY doctrine update; completion has not been independently confirmed.
- Do not install or restart the production daemon. npm's 149 vulnerabilities require review before later installation/release; no automatic security/dependency sweep.
- October 1 owner UAT did not happen. Footer copy/check and MP3 desktop/phone checks remain unverified; no owner/device UAT is claimed.
