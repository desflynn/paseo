# Overlays

Local changes we carry on top of an upstream Paseo release to build our `X.Y.Z-df` desktop app.
Each overlay has a patch and a plain description of what it must achieve. If upstream moves the
code and the patch stops applying, redo the change by hand from the description.

Plugins (`des/plugins/`) and upgrade notes (`des/upgrade-*`) are not overlays. They are not patches to Paseo code.

## Reapply on a new base

Commit or classify every project-owned change before you switch checkouts. Use the following
patch order on `v0.13.0`. The ten-patch stack reproduces 36 carried files byte-for-byte on this
base; see `REPLAY-PROOF-0.13.0.txt`. Each patch applies with plain `git apply` in this order, with
no offsets.

```bash
git apply des/overlays/unsigned-macos-build.patch
git apply des/overlays/pi-compaction-hold.patch
git apply des/overlays/pi-worktree-trust.patch
git apply des/overlays/pi-mcp-labels.patch
git apply des/overlays/reload-wait.patch
git apply des/overlays/pi-compaction-status.patch
git apply des/overlays/claude-stale-subagent.patch
git apply des/overlays/claude-auto-compact-window.patch
git apply des/overlays/speak-all-sessions.patch
git apply des/overlays/pi-paseo-mcp-timeout.patch
npm install                 # approve exact resolved install-script versions, see overlay 1
npm run build:desktop        # from the repo root; installation is a separate owner action
```

Check a patch without touching the working tree:

```bash
GIT_INDEX_FILE=/tmp/overlay-check.idx git read-tree vX.Y.Z
GIT_INDEX_FILE=/tmp/overlay-check.idx git apply --cached --check des/overlays/<name>.patch
```

## 0.13.0 carry results (2026-10-24)

Every carry was proven on the integrated branch. The overlay's sources went back to vanilla
`v0.13.0` with its tests left in place, the failure was recorded, then the sources were restored.
The RED counts below are those failures; the GREEN counts are the whole file or suite.

| Overlay                    | Verdict on 0.13.0 | Commit      | Tests                                                      |
| -------------------------- | ----------------- | ----------- | ---------------------------------------------------------- |
| unsigned-macos-build       | re-carried        | `645a1f55c` | npm reports 15 uncovered install scripts, then 2 by design |
| pi-compaction-hold         | kept, unchanged   | `a814e4eda` | 1 RED, then 128/128                                        |
| pi-worktree-trust          | kept, unchanged   | `f4ed7572b` | 1 RED, then 33/33                                          |
| pi-mcp-labels              | kept, unchanged   | `ba91c03a5` | 2 RED, then 153/153 Pi + 17/17 protocol                    |
| reload-wait                | re-carried        | `4209b3662` | 3 RED, then 366/366                                        |
| pi-compaction-status       | re-carried        | `fa4010c42` | 4 RED, then 134/134                                        |
| claude-stale-subagent      | kept, unchanged   | `2a0a017ea` | 6 RED, then 67/67                                          |
| claude-auto-compact-window | kept, unchanged   | `d5d475cd8` | 12 RED, then 126/126                                       |
| speak-all-sessions         | re-carried        | `83c95c885` | 9 RED, then 228/228 + 151/151 + 20/20                      |
| pi-paseo-mcp-timeout       | kept, unchanged   | `24ccae1da` | 3 RED, then 134/134                                        |

Dropped in 0.13, and why:

- **mine-label and sub-label are gone.** The daemon no longer puts `MINE` or `SUB` on a workspace.
  The deployed `detach-clears-SUB` fix (`7d88a16a4`) went with `SUB`, because it only ever existed
  to clear that label.
- **acp-context-meter stays retired.** Upstream's own `handleUsageUpdate` has covered it since
  `v0.11.0`.

Carrying `speak-all-sessions` needed three lines of the dropped `mine-label` plumbing: the hello's
`clientType` must reach the session, or the daemon speaker cannot tell an app socket from a CLI,
MCP or hub socket. The label behaviour itself stays dropped. See overlay 9.

## 1. Unsigned macOS build (the big one)

**Without this we cannot build or install our own desktop app.** We have no Apple signing or notarization credentials.

- Patch: `unsigned-macos-build.patch`
- Source commit: `645a1f55c`
- Upstream: never. This change is local only.

What it must achieve:

1. `packages/desktop/electron-builder.yml`, `mac:` block: build without signing or notarization.
   Set `hardenedRuntime: false`, `notarize: false`, `identity: null`, and remove the
   `entitlements` and `entitlementsInherit` lines.
2. `package.json`, root: an `allowScripts` map that approves the install scripts the build needs
   (native modules such as esbuild, fsevents, sharp, node-pty, workerd, msgpackr-extract).
   **Treat the versions as reference only.** On a new base run `npm install`, then ask npm what it
   blocks with `npm approve-scripts --allow-scripts-pending`, and approve those exact versions.

Re-derive the map; do not copy it. npm 11.19 reads `allowScripts` from the workspace-root
`package.json` only (`npm/lib/utils/allow-scripts-cmd.js`), so the field is load-bearing, not
decorative. On 0.13 it reported 15 uncovered install scripts. The 13 approved here cleared 13 of
them, and the map carries unchanged from 0.12 because the resolved versions did not move.

Two stay deliberately denied: `@shopify/react-native-skia@2.6.2` and
`react-native-enriched-markdown@1.2.0-nightly-20261014-766fc0e67`. Both build native React Native
assets, which the Electron web export does not need. `react-native-enriched-markdown` was already
denied in 0.12 for the same reason; `@shopify/react-native-skia` is new to the install-script set
on 0.13. Approve them only when a native iOS or Android build starts needing them.

`fsevents@2.3.3` and `fsevents@2.3.2` stay in the map even though npm no longer flags them. Neither
has an `install` or `postinstall` script, only `clean`, `build`, `test` and `prepublishOnly`, so
npm's scan passes over them. The entries are harmless, and correct if that ever changes.

Last verified: regenerated against `v0.13.0`; `npm approve-scripts --allow-scripts-pending` goes
from 15 uncovered to 2, both by design (2026-10-24).

## 2. Pi: hold prompts during manual compaction

After a manual `/compact`, Paseo sent the next prompt straight to Pi, and Pi's RPC `prompt()`
rejects prompts until compaction finishes. Pi's own terminal queues them; RPC callers must wait.

- Patch: `pi-compaction-hold.patch`
- Source commit: `a814e4eda`
- Upstream: not fixed on `main` as of 2026-10-24.

What it must achieve: in `packages/server/src/server/agent/providers/pi/agent.ts`,
`executeCompactCommand` holds a promise that settles in `finally`. `startTurn` waits on it before
`runtimeSession.prompt`, then delivers once. If the turn was interrupted while it waited, it
delivers nothing. A failed compaction still releases the prompt.

0.13 added a queued agent-to-agent delivery path (`agent/agent-messages/delivery.ts`, a receipt
after two quiet seconds). It does not bypass the hold: the `websocket-server.ts` dispatch calls
`sendPreparedPromptToAgent`, which reaches `startTurn`, so the hold covers it.

Last verified: carried onto `v0.13.0`; 1 RED then 128/128 in the Pi suite (2026-10-24).

## 3. Pi trust for managed worktrees

- Patch: `pi-worktree-trust.patch`. Source commit: `f4ed7572b`.
- The Pi provider adds `--approve` only when the cwd is a git worktree under
  `$PASEO_HOME/worktrees` and Pi already trusts its source checkout (`~/.pi/agent/trust.json`,
  nearest decision wins, as in Pi's `trust-manager.js`). The file is only read.
- Adds `agent/providers/pi/pi-project-trust.ts`.

Last verified: carried onto `v0.13.0`; 1 RED then 33/33 (2026-10-24).

## 4. Pi MCP server and action labels

- Patch: `pi-mcp-labels.patch`; source commit `ba91c03a5`.
- MCP gateway results supply an optional friendly `Server > Action` label without changing the
  canonical tool identity. Carry it through the extension adapter, live emission and history
  replay; the shared display helper uses the explicit label before its ordinary name mapping.
- No wire schema changes. Without this carry the preserved tool-results spike loses its labels.
- Apply after the Pi hold overlay.

The display precedence in `packages/protocol/src/tool-call-display.ts` is the part that breaks
silently: an explicit provider label leads, the Paseo presentation catalog sits beneath it, and the
agent-message branch returns first. A cataloged Paseo tool name must never bury a carried label.
That ordering survived 0.13 unchanged, so no re-anchoring was needed this time. The 0.12 patch
already carried the fix, and the RED case that pins it is the cataloged `Paseo > Get Agents` one.

Last verified: carried onto `v0.13.0`; 2 RED, then 153/153 Pi and 17/17 protocol (2026-10-24).
The modified `packages/app/e2e/browser/tool-call-overview-sheet.spec.ts` was not run; it needs the
browser capture harness.

## 5. Wait through an agent reload

- Patch: `reload-wait.patch`. Source commit: `4209b3662`.
- `wait_for_finish` awaits `agentManager.waitForAgentReload(id)` when the agent is off the live
  map, then waits normally. A reload no longer carries the "... process is closed" error its own
  close caused into the restored agent.

Two details of the carry:

1. `handleWaitForFinish` grew a `waitForDispatch` step inside the same `try`, before the live read.
   The guard goes immediately after it and still before the live read, so the stored record is
   never served while a reload is in flight.
2. The guard is only half of it. `resolvePreservedFailureState` drops a stored
   "… process is closed" error and its error attention at the reload capture site, because that
   error is the reload closing the old process, not a genuine failure. A genuine pre-reload error
   is preserved, and that case is the designed-green guard rather than a RED one.

Both assumptions still hold on 0.13. `jsonl-rpc-process.ts` still produces `<name> process is
closed`, and reload still runs through `runLifecycleMutation` and `prepareAgentForClosure`.

Last verified: carried onto `v0.13.0`; 3 RED then 366/366 across `agent-manager.test.ts` and
`session.test.ts` (2026-10-24).

## 6. Pi: show failed auto compactions

- Patch: `pi-compaction-status.patch`. Source commit: `fa4010c42`.
- `compaction_end` with `errorMessage` or `aborted: true` still closes the loading item, and a
  failed auto compaction also adds `[Error] Auto compaction failed at X / Y tokens: <msg>` or
  `... aborted at X / Y tokens`. The figures are the latest usage the poller published; without
  usage the line has no "at ..." part. The protocol status stays `loading | completed`, so old
  apps keep working.

Still needed on 0.13, confirmed rather than assumed: `rpc-types.ts` carries only
`reason`/`errorMessage`/`aborted` on `compaction_end`, and the protocol compaction status is still
`"loading" | "completed"` with no failure value. Upstream has not fixed this.

Last verified: carried onto `v0.13.0`; 4 RED then 134/134 (2026-10-24).

## 7. Claude subagent rows that never finish

- Patch: `claude-stale-subagent.patch`. Source commit: `2a0a017ea`.
- One "running" provider subagent row pins its whole workspace "running"
  (`workspace-directory.ts`), so a row nothing closes keeps the sidebar spinner and the "N working"
  pill on forever.
- In `providers/claude/`: an interrupt reports open legacy sidechain rows as `canceled` instead of
  dropping them; a successful result marks task-protocol foreground rows still `running` as
  `completed` (`completeRunningForegroundTasks`, backgrounded rows untouched); legacy rows are made
  only under subagent tools (`isClaudeSubagentToolName`), so MCP tool calls no longer show as
  nameless "Claude subagent" rows.

Upstream still lacks `completeRunningForegroundTasks` and the legacy gate on 0.13; the six RED
cases prove it.

Last verified: carried onto `v0.13.0`; 6 RED then 67/67 across the three carry suites (2026-10-24).

## 8. Claude effective auto-compact window

- Patch: `claude-auto-compact-window.patch`. Source commit: `d5d475cd8`.
- Report the configured auto-compact window rather than the model's full window. Resolve the
  SDK environment override, model-specific user setting, then top-level user setting; cap the
  override at the model window. Without an override, preserve SDK reporting unchanged.
- Seed first-stream usage from SDK init and keep helper model usage from inflating the primary
  configured window. Token accounting and the percentage trigger override stay unchanged.
- Precedence: `CLAUDE_CODE_AUTO_COMPACT_WINDOW` beats `modelSettings[<model>].autoCompactWindow`,
  which beats the top-level value, which beats the model window, capped at the model window.

  0.13 keys usage by the active model, and that plumbing is undisturbed. The model-keyed RED cases
  fail without this overlay and pass with it, so the active-model anchoring still binds.

Last verified: carried onto `v0.13.0`; 12 RED then 126/126 (2026-10-24).

## 9. Speak in every agent session

- Patch: `speak-all-sessions.patch`; source commit `83c95c885`. Apply after the Claude auto-compact
  overlay.
- Goal: any agent gives Des a spoken report through Paseo's own `speak` tool, with chat mode off.
  Asked for by Des on 22 Oct 2026 through DCI Head Guy; spec in
  `/Users/des/dev/dci-harness/planning/paseo-speak-all-sessions.md`.

What it must achieve:

1. **`speak` is always registered.** Its text says to use it only when Des asks for a spoken
   report, and to send the whole report in one call.
2. **Delivery.** An agent in chat mode keeps its voice-session handler. Every other agent speaks
   through a daemon-owned speaker (`speech/daemon-speaker.ts`) that synthesises with the daemon's
   TTS and sends `audio_output` with `isVoiceMode` false to one app session: the client where Des
   last typed a prompt in the speaking agent's chat (`Session.lastUserPromptAt`; prompts with a
   `sourceAgentId` are other agents and do not count). With no such prompt on any client it falls
   back to the most recently active client (`Session.lastInteractionAt`, any non-ping request).
   "Most recently active" alone failed: a Windows laptop's background requests kept it freshest,
   so reports played there while Des listened on his phone. Several clients playing at once also
   sounded like an echo on the first install.
3. **One clip per report.** `TTSManager.generateAndWaitForPlayback(..., singleClip)` sends every
   sentence as a chunk of one audio group (only the last chunk has `isLastChunk`), and the app
   buffers the group and plays it once. Per-sentence clips let a car's Bluetooth drop to the radio
   between sentences and clipped the first words of the next one. Voice mode keeps per-sentence
   playback. The first chunk of a report starts with two seconds of silence (PCM only,
   `leadInSilence` in `tts-manager.ts`): a car or phone is still routing audio to Bluetooth when
   the clip starts, and otherwise clips the first words.
4. **A modern app socket drops any message nobody owns** (`SessionDelivery.permits`), so the
   speaker sends through `SessionDelivery.broadcast`, which gives each socket its own copy under a
   one-shot owner. Without it the frame is built and never reaches the wire.
5. **Confirmations.** `audio_played` ids a voice session does not know go to the daemon speaker
   (`voiceBridge.confirmDaemonAudioPlayed`); `TTSManager.confirmAudioPlayed` now returns whether it
   knew the id. The first confirmation per chunk resolves the call; later ones are ignored.
6. **Only an app socket may receive audio.** `daemon-speaker.ts` builds its recipient set as
   `listSessions().filter((session) => session.isAppClient())`, and `isAppClient()` reads
   `this.clientType`, which is `"mobile"` or `"browser"`.

**Why a speak overlay touches `clientType`.** Upstream 0.13 has no `clientType` on `Session`. The
hello carries it (`packages/protocol/src/messages.ts`, enum `mobile | browser | cli | mcp | hub`),
but the daemon never stored it. The three lines that store it lived in our dropped `mine-label`
overlay. This patch carries exactly that plumbing and nothing else: `SessionOptions.clientType`,
the field and its assignment, and `websocket-server.ts` passing `hello.clientType` into each
`Session`. That is what lets the speaker tell a phone or browser from a CLI, MCP or hub socket. It
carries **no** MINE behaviour: no `setAssignment`, no label, no catalog entry. There is no
substitute, because 0.13's `CLIENT_CAPS` are feature flags and none of them identifies an app
client.

**Upstream #7756 does not collide with this, and the fix helps it.** `ca894d49a` (in `v0.13.0`)
consumes the OpenAI speech response inside the provider (`await response.arrayBuffer()`), because a
prefetched sentence whose body nobody had read yet could lose its response to garbage collection
and then be skipped at playback. That is the provider layer. Our changes are the manager layer:
grouping chunks, and prefixing silence bytes. The overlay touches nothing under
`speech/providers/`, so the two never meet. Our single-clip path reuses the same
`TTS_PREFETCH_SEGMENTS` prefetch pool as voice mode, so it inherits the fix. It was in fact the
worse exposure before the fix, because single-clip holds up to two unread bodies while earlier
chunks play. `leadInSilence` is unaffected, because the fix changes how the source stream is
materialised, not the bytes it yields. Note the fix only rides the OpenAI-compatible provider;
Des's default local Kokoro TTS never enters that code path.

Failures the agent can read: TTS not configured, no app client connected (plugin, CLI and MCP
sessions do not count), no client confirmed within ten minutes. The 4000 character cap stays.

Daemon-side only, so it ships as an `app.asar` backend payload and needs no app rebuild.

Last verified: carried onto `v0.13.0`; 9 RED then 228/228 across the five carry suites, 151/151 in
`session.test.ts` including the new `isAppClient` case, and 20/20 across the websocket and
wire-compat suites (2026-10-24). The two new files are `speech/daemon-speaker.ts` and its test.

## 10. Pi: long timeout on the Paseo MCP entry

- Patch: `pi-paseo-mcp-timeout.patch`. Applies after overlay 9. Source commit `24ccae1da`.
- `speak` blocks until playback ends, and the daemon caps playback at 10 minutes. Pi's MCP client
  gives up on a tool call after 60 s by default, so a report over about 600 characters made the
  agent see "Request timed out" (-32001) while it was still playing, and agents re-sent it.
- The Paseo-injected `paseo` entry now carries a 660 s timeout on both Pi paths: `timeout` (seconds)
  for the built-in MCP and `requestTimeoutMs` (milliseconds) in the pi-mcp-adapter temp config.
  Other servers keep Pi's default. A config-only fix in `~/.pi/agent/mcp.json` does not work,
  because the injected entry replaces a same-named global one.
- The entry name is still `paseo` on 0.13: `agent/runtime-mcp-config.ts` injects it, and
  `hub/daemon-executions.ts` still reserves that name.
- Daemon-side only, so it ships in the `app.asar` backend payload. A running Pi agent keeps its
  old MCP config until it restarts or reloads.

Last verified: carried onto `v0.13.0`; 3 RED (built-in, resumed session, adapter file) then
134/134 (2026-10-24).
