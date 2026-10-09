# Overlays

Local changes we carry on top of an upstream Paseo release to build our `X.Y.Z-df` desktop app.
Each overlay has a patch and a plain description of what it must achieve. If upstream moves the
code and the patch stops applying, redo the change by hand from the description.

Plugins (`des/plugins/`) and upgrade notes (`des/upgrade-*`) are not overlays. They are not patches to Paseo code.

## Reapply on a new base

Before switching the existing checkout, commit or classify every project-owned change. Seed the
new branch with the preserved plugin, overlay and harness assets so daemon-served paths remain
available. Use the following patch order on `v0.11.1`; overlay 2 remains superseded.
The nine-patch stack reproduces 30 carried files byte-for-byte on this base; see
`../upgrade-0.11.1/WORKING-LOG.md`.

```bash
git apply --3way des/overlays/unsigned-macos-build.patch
git apply --3way des/overlays/mine-label.patch
git apply --3way des/overlays/pi-compaction-hold.patch
git apply --3way des/overlays/sub-label.patch
git apply --3way des/overlays/reload-wait.patch
git apply --3way des/overlays/pi-worktree-trust.patch
git apply --3way des/overlays/pi-compaction-status.patch
git apply --3way des/overlays/claude-stale-subagent.patch
git apply --3way des/overlays/pi-mcp-labels.patch
npm install                 # approve exact resolved install-script versions, see overlay 1
npm run build:desktop        # from the repo root; installation is a separate owner action
```

Check a patch without touching the working tree:

```bash
GIT_INDEX_FILE=/tmp/overlay-check.idx git read-tree vX.Y.Z
GIT_INDEX_FILE=/tmp/overlay-check.idx git apply --cached --check des/overlays/<name>.patch
```

## 1. Unsigned macOS build (the big one)

**Without this we cannot build or install our own desktop app.** We have no Apple signing or notarization credentials.

- Patch: `unsigned-macos-build.patch`
- Source commits: `aa614fd8d`, `4389f35ad`, `e7de061dd`
- Upstream: never. This change is local only.

What it must achieve:

1. `packages/desktop/electron-builder.yml`, `mac:` block: build without signing or notarization.
   Set `hardenedRuntime: false`, `notarize: false`, `identity: null`, and remove the
   `entitlements` and `entitlementsInherit` lines.
2. `package.json`, root: an `allowScripts` map that approves the install scripts the build needs
   (native modules such as esbuild, fsevents, sharp, node-pty, workerd, msgpackr-extract).
   The package versions in the patch belong to the 0.11.0 dependency tree. **Treat them
   as reference only.** On a new base, run `npm install`, read which install scripts npm blocks,
   and approve those exact versions.

Last verified: regenerated against `v0.11.1`, with the same 13 resolved install-script approvals;
`npm install` succeeds without external dependency-version changes (2026-10-09).

## 2. ACP context meter

ACP agents report the context-window size and the tokens used in `usage_update`. Upstream
0.10.3 drops these values (`handleUsageUpdate` is `void update;`), so ACP agents show no context meter.

- Patch: `acp-context-meter.patch`
- Source commit: `852173171`
- Issue: getpaseo/paseo#1390

What it must achieve: in `packages/server/src/server/agent/providers/acp-agent.ts`,
`handleUsageUpdate` pushes a `usage_updated` event with `contextWindowUsedTokens: update.used`
and `contextWindowMaxTokens: update.size`.

**Superseded in `v0.11.0`: do not apply.** The base includes upstream `48329facc` (#4848,
"surface context-window usage from the ACP usage_update notification"), which also validates the
inputs. Keep this patch as a historical reference for older bases lacking that commit.
Check: `git tag --contains 48329facc`.

## 3. MINE label for work the owner started

The sidebar shows the work Des handed out. When the Paseo app creates an agent or sends one a
prompt, the daemon puts the workspace label `MINE` on that agent's workspace. Agents, the CLI,
DCI, plugins and schedules never add it. The daemon never removes it. Guys ask Des whether to keep
or clear it when they deliver (dci-harness doctrine, `paseo-messaging.md`, WHEN YOU ARE THE GUY).

- Patch: `mine-label.patch` (server only; the phone app needs no change)
- Worklog: `MINE-WORKLOG.md`
- Upstream: not filed.

What it must achieve:

1. `websocket-server.ts`: pass the hello's `clientType` into the `Session`.
2. `session.ts`: store it. After an accepted `agent.create.request`, `create_agent_request` or
   `send_agent_message_request` from a `mobile` or `browser` session, call the workspace label
   service `setAssignment` with `MINE`, `assigned: true`. Do not await it. Log a warning on failure.
   The app sends `clientType: "mobile"` on phone, desktop and web
   (`packages/app/src/runtime/host-runtime.ts`); CLI, DCI and plugins send `cli`.
3. The `MINE` catalog entry is created in the app. If it already exists, the label service keeps its colour.

Last verified: regenerated against `v0.11.0`; owner-label cases 4/4 (2026-10-07).

## 4. Pi: hold prompts during manual compaction

After a manual `/compact`, Paseo sent the next prompt straight to Pi, and Pi's RPC `prompt()`
rejects prompts until compaction finishes. Pi's own terminal queues them; RPC callers must wait.

- Patch: `pi-compaction-hold.patch`
- Worklog: `PI-COMPACTION-WORKLOG.md`
- Upstream: not fixed on `main` as of 2026-10-04.

What it must achieve: in `packages/server/src/server/agent/providers/pi/agent.ts`,
`executeCompactCommand` holds a promise that settles in `finally`. `startTurn` waits on it before
`runtimeSession.prompt`, then delivers once. If the turn was interrupted while it waited, it
delivers nothing. A failed compaction still releases the prompt.

Last verified: carried onto `v0.11.0`; three hold cases pass in the Pi suite (2026-10-07).

## 5. SUB label for agent-created workspaces

When agent traffic creates an agent that is alone in its workspace, the daemon puts the workspace
label `SUB` on that workspace. Agent traffic means CLI and DCI sessions (`cli`), in-daemon MCP
`create_agent`, and schedules. App-created agents never get SUB. A workspace that already holds
another agent, such as the parent's, never gets SUB. The daemon never removes it. DCI's launch
tool may also set SUB; a second assignment does nothing.

- Patch: `sub-label.patch` (server only)
- Worklog: `SUB-WORKLOG.md`
- Upstream: not filed.

What it must achieve: one helper, `workspace-labels/sub-label.ts` `maybeApplySubLabel()`, checks
that no other listed agent shares the workspace, then calls `setAssignment` with `SUB` without
waiting, and logs a warning on failure. Call it after a create in `session.ts` (non-owner sessions
only), `agent/tools/paseo-tools.ts` (`create_agent`) and `schedule/service.ts`. `bootstrap.ts`
passes the label service into the last two. The `SUB` catalog entry is created in the app.

Last verified: regenerated after MINE on `v0.11.0`; combined owner/agent/schedule label slice 9/9 (2026-10-07).

## 6. Wait through an agent reload

- Patch: `reload-wait.patch`. Worklog: `RELOAD-WAIT-WORKLOG.md`.
- `wait_for_finish` awaits `agentManager.waitForAgentReload(id)` when the agent is off the live
  map, then waits normally. A reload no longer carries the "... process is closed" error its own
  close caused into the restored agent.

## 7. Pi trust for managed worktrees

- Patch: `pi-worktree-trust.patch`. Worklog: `PI-TRUST-WORKLOG.md`.
- The Pi provider adds `--approve` only when the cwd is a git worktree under
  `$PASEO_HOME/worktrees` and Pi already trusts its source checkout (`~/.pi/agent/trust.json`,
  nearest decision wins, as in Pi's `trust-manager.js`). The file is only read.

## 8. Pi: show failed auto compactions

- Patch: `pi-compaction-status.patch`. Worklog: `PI-COMPACTION-STATUS-WORKLOG.md`.
- `compaction_end` with `errorMessage` or `aborted: true` still closes the loading item, and a
  failed auto compaction also adds `[Error] Auto compaction failed at X / Y tokens: <msg>` or
  `... aborted at X / Y tokens`. The figures are the latest usage the poller published; without
  usage the line has no "at ..." part. The protocol status stays `loading | completed`, so old
  apps keep working.

## 9. Claude subagent rows that never finish

- Patch: `claude-stale-subagent.patch`. Worklog: `CLAUDE-STALE-SUBAGENT-WORKLOG.md`.
- One "running" provider subagent row pins its whole workspace "running" (`workspace-directory.ts`),
  so a row nothing closes keeps the sidebar spinner and the "N working" pill on forever.
- In `providers/claude/`: an interrupt reports open legacy sidechain rows as `canceled` instead of
  dropping them; a successful result marks task-protocol foreground rows still `running` as
  `completed` (`completeRunningForegroundTasks`, backgrounded rows untouched); legacy rows are made
  only under subagent tools (`isClaudeSubagentToolName`), so MCP tool calls no longer show as
  nameless "Claude subagent" rows.
- The 0.11 carry preserves upstream #6295's background-helper routing and survival; six new-base
  RED cases restore to 66/66 GREEN. See `../upgrade-0.11/CLAUDE-CARRY-WORKLOG.md`.
- On 0.11.1, retain this overlay alongside #6308's heartbeat guard and #6316's client reconnect
  resync. The new heartbeat case already passes through the broader DF legacy gate; the server
  completion/cancellation behaviours still need this overlay. The three carry suites pass 67/67;
  regenerated patch replay is byte-exact. See `../upgrade-0.11.1/WORKING-LOG.md`.

## 10. Pi MCP server and action labels

- Patch: `pi-mcp-labels.patch`; source candidate `cde2d2d75` from preserved `0.10.3-df`.
- MCP gateway results supply an optional friendly `Server > Action` label without changing the
  canonical tool identity. Carry it through the extension adapter, live emission and history
  replay; the shared display helper uses the explicit label before its ordinary name mapping.
- No wire schema changes. Without this carry the preserved tool-results spike loses its labels.
- Apply after the Pi hold/status overlays. Parent display/adapter/history suites 39/39; host
  transformer 8/8; emission regression passes within Pi's 127/127 suite on `v0.11.0`.
- Evidence: `../upgrade-0.11/PI-CARRY-WORKLOG.md` and `../upgrade-0.11/WORKING-LOG.md`.
