# Claude effective context window

## Goal and authority

Des's ask relayed by Global Persona Guy: daemon-side only on mac-studio. Context popup denominator and used percentage must use the effective auto-compact window, not the model's full 1M. No app/renderer change, no upstream PR, no DCI warning-hook change.

Precedence: CLAUDE_CODE_AUTO_COMPACT_WINDOW > user settings modelSettings[model id].autoCompactWindow > user settings autoCompactWindow > model window; cap at the model window. CLAUDE_AUTOCOMPACT_PCT_OVERRIDE changes the trigger, not this denominator.

## Verified starting state

- Branch 0.11.1-df; tracked checkout clean. Installed app and daemon verified 0.11.1 after Des's manual install.
- ClaudeContextUsageState gets an initial manifest window, then extractContextWindowSize replaces it using SDK modelUsage.contextWindow. Model switches also reset the initial manifest window. All denominator paths need the effective resolution.
- Current user model settings: Haiku 5.5 112000; Sonnet/Opus 5.5 550000; no top-level override. Settings file is read-only.
- Global Persona Guy live id: 55e52eca-65c9-486a-bf2f-3dc49b861f11.

## Done

- Bead paseo-dgo claimed. Settings values verified without exposing unrelated data.
- FM child 101cd3b3-0538-4332-93ab-7b5055d88e4f (Pi GLM 5.3 Flash/high) implemented agent.ts and 11 behaviour tests using temporary settings fixtures. RED: 9 failures / 90 passes; GREEN: 99/99. Scoped static gates passed. Evidence: FM-WORKLOG.md. Child harvested and archived.
- Parent review exposed two additional failures: helper Opus usage inflated a primary Haiku window to 550000; SDK init did not seed the first stream window when configured model was absent. Added two tests, proved both RED, fixed primary-model selection and init seeding. Whole focused suite GREEN: 101/101. Used-token accounting and no-override SDK behaviour remain unchanged.
- Source formatting/lint, root server/declaration build and root typecheck passed. Logs: /tmp/paseo-window-{review-red,review-green,format,lint,build-server,typecheck}.log.
- Added claude-auto-compact-window.patch and indexed it. Ten patches replay from v0.11.1 to 31 carried files byte-for-byte: REPLAY-PROOF.txt.
- Prepared ignored .dev/claude-auto-compact-window/backend-only.asar. Exactly one packaged daemon JS module changes. All other archive metadata and original packed bytes are unchanged; unpacked tree is untouched. PAYLOAD-PROOF.json records hashes. No installed app/daemon files changed.
- Preparation initially failed because the installed archive references a missing optional unpacked SDK LICENSE.md. Rather than invent or modify unrelated files, the preparer preserves the existing archive data/unpacked tree and appends the replacement provider module with an updated ASAR header/integrity. Official ASAR reader verifies the result and hashes verify byte preservation.
- Packaged source maps are absent already; the prepared archive adds none. Native Electron Node import of the prepared Claude provider passed without starting a daemon or inference. Existing unpacked dependencies are linked read-only under .dev for that check. Log: /tmp/paseo-window-native-import.log.
- Installed Electron embedded-ASAR-integrity fuse is disabled (fuse 4 = ASCII 48), so the backend-only archive does not require a plist/renderer/binary change.
- Latest read-only daemon status: version 0.11.1, supervisor PID 3985. Packaged worker loads /Applications/Paseo.app/Contents/Resources/app.asar.

- Reviewed source, carry patch, evidence and manual rollout/rollback instructions committed and pushed as 0166bcdd5 on origin/0.11.1-df; divergence 0/0. Commit hooks passed. Strong secret scan: 10 staged paths, zero findings. Source whitespace is clean; unified patch context blank lines are retained for patch replay.

## Pending / owner gate

- Superseded by Des's explicit approval: "A but YOU roll out. What is the rollback plan. Stop all active agents. We restart paseo post rollout. Then u reactivate them on my go with \"continue\"."
- Fixer now owns the authorized archive replacement and Paseo restart. No agent/schedule reactivation before Des's continue go. authorized-rollout.sh contains the exact rollout, dated backup and automatic copy/hash-failure rollback; it writes .dev/claude-auto-compact-window/rollout-result.txt. No wake will be filed.
- No deployment, live write, daemon restart, app installation or inference has been performed. Live popup proof for Opus /550k and Haiku /112k is still pending; test/packaging proof is not device UAT.
- Des temporarily routed reports through Zoe, then explicitly stopped contact with Zoe and status relays/acks. Continue independently; ask Des directly only when needed.
- The earlier restart was not authorization; the new explicit YOU-rollout approval is. Three other active agents were cancelled and verified idle: FP-TESTER 9cd8da13, DGX Doer 5d8a06d0, SUPER-SH-5 9a9a1d88. SUPER's pending question was denied with interrupt solely to permit cancellation; its unrelated production switch was NOT approved. PAUSED-AGENTS.json preserves full IDs. This Fixer stops with the daemon.
- Five automatic new-agent schedules paused to prevent reactivation while held; IDs, targets and previous states are in PAUSED-SCHEDULES.json. Preserve them; resume only on Des's go. Renderer and app-dist bytes remain unchanged; no full desktop build/install is needed.
- Concurrent DGX picker ask completed first: all three entries already existed; labels/thinking labels corrected, Ornith default changed to Medium. Both Qwens expose Low/Medium/Xhigh; Ornith Off/Medium; all three default medium. Live list_models confirms 18 total, other 15 entries and every other config field unchanged. Backup /Users/des/.paseo/config.json.bak-20261010-153510-dgx-picker; config-only reload applied agents.providers with no restart-required paths. Exact result relayed to Pi Fixer d11bb301-7d39-4239-9dd7-c3bc3799faf5; pickup/idle confirmed. No DGX calls, container boots, inference, URLs or invented native metadata fields.
