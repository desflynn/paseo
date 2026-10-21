# Paseo 0.12 update check (2026-10-21, report only)

Base today: branch 0.11.1-df (v0.11.1 + overlays). Upstream: v0.12.0, 236 commits past v0.11.1. Upstream also cut v0.11.2, v0.11.3 and v0.11.4; our base does not include them.

Nothing was built, installed or applied. No daemon was restarted.

## Verdict

**Not a drop-in. Worth doing, with real carry work.** Four overlays apply clean, one retires, and six conflict. One of the six, `claude-auto-compact-window`, has to be re-implemented on reworked upstream code.

## Overlays vs v0.12.0

Method: detached worktree at `v0.12.0` (cafe4b01c), one plain `git apply --check` per patch, nothing applied. Re-run independently by the head guy: same results. Plain `--check` is stricter than the `--3way` method used for 0.11, so some conflicts may shrink under `--3way` (not tried).

| Overlay                    | Verdict         | Why                                                                                                                                  |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| unsigned-macos-build       | applies clean   | `electron-builder.yml` changed only by a linux icon entry.                                                                           |
| pi-compaction-hold         | applies clean   | Pi compaction code almost untouched upstream.                                                                                        |
| pi-worktree-trust          | applies clean   |                                                                                                                                      |
| pi-mcp-labels              | applies clean   | The patch applies, but `tool-call-display.ts` was rewritten around the new `paseo-tool-presentation/`. Re-check precedence.          |
| acp-context-meter          | retired         | Upstream ships its own ACP usage fix (`acp-agent.ts` `handleUsageUpdate`). Stays retired.                                            |
| mine-label, sub-label      | conflict        | `session.ts` create-flow rework (gitIntent, CreatedAgent) and a `paseo-tools.ts` catalog rework.                                     |
| reload-wait                | conflict        | `session.ts` send region reworked (`readSettledAgent`, `sourceAgentId`).                                                             |
| pi-compaction-status       | conflict (test) | Only `pi/agent.test.ts`.                                                                                                             |
| claude-stale-subagent      | conflict        | Upstream's new `settledSubagentToolCalls` turn mapping replaced our anchor line. Our gate is still absent upstream.                  |
| claude-auto-compact-window | **rework**      | Context usage is now model-keyed; `getClaudeContextWindowMaxTokens` is new. Configured auto-compact window is still absent upstream. |

## Risks, high to low

1. **pi-mcp-labels anchor moved.** Precedence needs a re-anchor and a retest.
2. **Claude provider churn** (19 files, +2,341/−124; `agent.ts` +335/−94) around claude-auto-compact-window and claude-stale-subagent. Upstream fixed parts of the same bug class (#6660, #6242), so some of overlay 9 may retire.
3. **Build pipeline.** Protocol zod-aot generation is now per message type, so a stale `dist` ships the old validator. `patches/` swaps the markdown engine to a pinned enriched-markdown nightly. `allowScripts` must be re-derived on the new lockfile.
4. **`pluginsEnabled` still defaults to false** (`config.ts:627`). semantic-markdown stays off after an upgrade unless the config carries it.
5. **Background workspaces** are a new hidden-workspace class. How they interact with the SUB and MINE labels is undecided. Agent-to-agent MCP sends now steer a running turn instead of interrupting it (#5164): a fleet behaviour change.

Good news: plugin SDK core is stable (5 files). Plugin timeline rows still cannot declare a height. Config shape is additive only. The desktop `mac:` block and root `package.json` are untouched, so the unsigned overlay and the surgical `app.asar` pattern see no upstream movement.

## Not confirmed

- Whether the Claude effective auto-compact window semantics changed, or only the code around it.
- Which native modules moved in `package-lock.json`.
- Where the `patches/` entries are applied in our npm build.
- Whether `--3way` rescues any of the six conflicts.

## Detail

- [Overlays vs v0.12.0](OVERLAYS-VS-0.12.md): per-patch results and conflict causes.
- [Other changes in 0.12](OTHER-CHANGES-0.12.md): protocol, plugins, daemon, desktop, config, with file paths.
