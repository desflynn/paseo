# Other changes in upstream v0.12.0 that touch the Paseo custom build

FM0 research for ticket o1.2.2 · base v0.11.1 → target v0.12.0 (via v0.11.2, v0.11.3, v0.11.4, beta.1–3) · 2026-10
Method: diffs read from git objects in `/Users/des/dev/paseo` (tags verified fetched: v0.11.1…v0.12.0) plus detached worktree `/tmp/paseo-v012-changes` at v0.12.0. No repo tree touched.
Scope: everything EXCEPT whether our overlay patches apply cleanly (that is ticket o1.2.1's job).
Legend: **PROVED** = read in the diff/tree. INFERRED = judgement from evidence. NOT CONFIRMED = unproven.

Sections: 1 headlines · 2 protocol · 3 plugin SDK vs semantic-markdown · 4 daemon · 5 desktop build · 6 overlay conflicts/retirements · 7 config shape · 8 risk list.

---

## 1. Headline changes in release order

**PROVED sizes:**

- `CHANGELOG.md` at v0.12.0: the 0.12.0 section is ~201 lines; 0.11.4 is 23, 0.11.3 is 15, 0.11.2 is 6 (extracted to /tmp/paseo-0.12-check/changelog-\*.md).
- `git diff --stat v0.11.1..v0.12.0`: packages/server 231 files, +16,739/−1,822; packages/protocol 29 files, +1,418/−422; packages/plugin only 5 files, +225/−11; packages/desktop 12 files (see §5).

### v0.11.2 (2026-10-09)

- One fix: intermittent text clipping in iOS chats and Markdown previews (#6445). No custom-build impact.

### v0.11.3 (2026-10-15)

- Hoplite joins as an opt-in ACP provider; Add-provider catalog gains search; failures show as toast (#6953, #7030). App-side only.
- Remove is no longer offered for plugin providers such as Antigravity and Muse Code (#6568).

### v0.11.4 (2026-10-15)

- Hoplite discovery fix in Settings → Providers. No custom-build impact.

### v0.12.0 (2026-10-19) — the payload release

Headlines (CHANGELOG.md at v0.12.0):

- **Background workspaces**, hidden from the sidebar unless Show background is on (#5039, #7141). Touches daemon workspace model + sidebar — see §4/§6 for our SUB-label overlap.
- **New Markdown renderer** for chats/previews: cross-paragraph text selection, code-block copy buttons, sideways-scrolling wide tables on phones (#6973). New doc `docs/markdown-renderer.md`. Big for our semantic-markdown plugin — see §3.
- **Reworked phone layout**: floating header (#6431), closable sheets for files/subagents (#6827), Settings as large tiles (#7129), fullscreen composer (#6531 et al).
- **120+ fixes.**

Declared before-upgrading breaking changes (CHANGELOG.md, "Before upgrading"):

- `paseo run --background` deprecated in favour of `--no-wait`.
- `paseo permit allow`/`deny` now exit non-zero when the daemon doesn't confirm within 15 s.

Custom-build-relevant items inside the fix list (all PROVED in CHANGELOG.md at v0.12.0):

- **Agent-to-agent messages now steer the running turn instead of interrupting it** (#5164), and carry the sender's name (#6373). Daemon MCP/send paths — see §4.
- **Memory-leak fixes**: plugin hosts/CLI/desktop growing to ~1 GB after 30–75 min (#6847); daemon OOM on long OpenCode v2 streams (#6262); daemon OOM on overlapping directory searches (#7265).
- **Schedule fixes**: schedule never running again after one unrecordable run (#6334); schedules sharing a cron minute running a slot twice and skipping the next (#6532).
- **Child-agent lifecycle fixes**: parent missing the finish notification when a child's first turn is very fast (#6008); parent told a child finished when it was stopped/reloaded (#6660).
- **Claude subagent fixes**: background subagent cards staying empty (#6242, #7266) — same area as our overlay 9, see §6.
- **Pi fixes**: thinking level not updating when a Pi extension changes it (#6741); pi-subagents staying running after turn limit (#6594).
- **Compaction**: manual `/compact` on OMP agents showing no progress and leaving the context meter stale (#6106).
- **Config fixes**: symlinked `config.json` replaced by a regular file on save (#6023); published config schema rejecting valid `agentProfiles` and `plugins` keys (#6621) — see §7.
- **Plugin fixes**: plugins importing Paseo protocol types failing to install ("Could not resolve type dependency", #7023) — directly relevant to our plugin's vendored deps, see §3.
- `paseo agent ls` capped at 200 agents (#6033); usage CLI `paseo usage` added (#6474); Claude Mythos 5.1 discovery (#6403).

## 2. WebSocket protocol / packages/protocol

**Compatibility docs did not move.** `git diff --stat v0.11.1..v0.12.0` over `docs/protocol-compatibility.md` and `docs/rpc-namespacing.md` is empty (PROVED). Only `docs/protocol-validation.md` changed.

**Wire changes are additive optional fields (PROVED):**

- `agentMessage: AgentMessageSchema.optional()` in `packages/protocol/src/messages.ts` (+ new `src/agent-message.ts`) — sender name/context on agent-to-agent messages (#6373).
- `includeBackground: z.boolean().optional()` in four places (`packages/protocol/src/messages.ts:917,1245,1279,1290`) — the background-workspaces filter.
- `messages.wire-compat.test.ts` updated; no field narrowed or removed in the diff. Old-client-parses-new holds by inspection (INFERRED from optional additions + repo compat policy).

**Outbound validation re-architected — this is fix #6847 (PROVED, from `docs/protocol-validation.md` diff and the file list):**

- Why: the single generated `WSOutboundMessageSchema` compiled to one 11 MB zod-aot function. On V8 — daemon clients, plugin hosts, the CLI, and Electron — Maglev compiled it hot, allocating ~800 MB and stalling for seconds, repeatedly after each deopt. Hermes (mobile) never showed it.
- How now: `src/validation/ws-outbound-envelope.ts` (new) checks only each message's `type` tag, then dispatches through a generated `type` → validator map, one function per message type. Issue paths are prefixed `message` so callers see the same shape.
- Deleted: `src/validation/ws-outbound-schema-metadata.ts`, `codegen/ws-outbound.compile.ts`. `scripts/generate-validation-aot.mjs` now writes the discovery entry and metadata itself. The generated runtime file stays gitignored.
- Guard: `packages/protocol/tests/validation/ws-outbound.test.ts` fails if any generated function exceeds 1 MB.
- Wire format unchanged (doc states it; PROVED in doc diff).
- Build impact (INFERRED): our desktop build must run the protocol generation step; a stale `dist` in the protocol package would ship the old single-function validator.

**New inbound size limits (PROVED, `src/websocket-message-limit.ts` at v0.12.0):** daemon accepts max 100 MB per WS message, relay 32 MB encrypted frame; bigger closes the connection with 1009 (#6285 — oversized attachments used to disconnect the host in a loop).

**Paseo tool-call presentation moved (PROVED):** `src/paseo-tool-call-detail.ts` split into a new `src/paseo-tool-presentation/` module (`index.ts`, `catalog.ts`, `detail-sections.ts`, `summary-text.ts`, `agent-message.ts`); test renamed R060. `src/tool-call-display.ts` now early-returns a `paseoDisplay` for Paseo tools and agent messages; the Paseo-leaf-name special case was REMOVED from `humanizeToolName`; new optional inputs `agentMessage` and `targetAgentTitle`. This is #7283 (tool rows lead with action + context) and interacts with overlay 10 — see §6.

Also touched: `src/terminal-snapshot.ts`, `src/provider-icon-names.ts` (new provider icons), `src/agent-types.ts`.

## 3. Plugin SDK and plugin host vs des/plugins/semantic-markdown

**SDK core is stable (PROVED):** `packages/plugin` changed only 5 files v0.11.1→v0.12.0: `src/server/acp.ts` +2, `src/server/provider.ts` +2, new `src/server/acp.test.ts` +173 (+stat tail). No manifest schema change in `packages/protocol` (no manifest file in the protocol diff list).

**Claimed rows / itemKind (PROVED):** `packages/app/src/plugins/timeline/view.tsx` is NOT in the upstream diff — the claimed-row match (`candidate.kind === item.itemKind && candidate.version === item.version`, view.tsx:53) is unchanged. `timeline/projection.ts` changed by exactly +1 line; our plugin's `{ type: "plugin", kind: "semantic-markdown", version: 1 }` items keep working.

**Row height (PROVED):** grep for `estimatedItemSize|itemHeight|declareHeight|rowHeight` over `packages/app/src/plugins` at v0.11.1 AND v0.12.0: zero hits at both tags. **Plugin timeline rows still cannot declare height in 0.12** — sizing stays renderer-controlled. Changelog #7364 (taller subagent rows) is the app's own Subagents panel, not a plugin API.

**Plugin host / install (PROVED):** `packages/server/src/server/plugins/compiler.ts` now skips local dependency installation for type-only `@getpaseo/protocol/` imports (#7023, compiler.ts:245+ — "Erased imports need no plugin-local install"). Our plugin imports protocol types, so its install gets easier. Host churn: `plugin-process.ts`, `plugin-process-protocol.ts`, `plugins/index.ts`, `plugin-provider.ts`, `builtin/index.ts`, `usage-sources/`.

**pluginsEnabled gate unchanged (PROVED):** `packages/server/src/server/config.ts:627` still reads `persisted.pluginsEnabled ?? false`; `persisted-config.ts:330` still `z.boolean().optional()`. After any upgrade, third-party plugins (ours) stay silently disabled unless `pluginsEnabled: true` is in `~/.paseo/config.json`.

**Vendored `@getpaseo/highlight` (PROVED):** `packages/highlight` drifted only +35/−5 since v0.11.1 (Astro parser fix + tests). The big Vue-parser change was in 0.11.0, already re-vendored. Re-vendoring on 0.12 is cheap.

**Theme props (PROVED):** no theme change in `packages/plugin`. Our plugin reads the theme string from its own app-settings blob and colours from its vendored theme copy (`client/vendor/styles/theme.ts`, copied at 0.9.2) — insulated from the 0.12 app theme work (#6707 etc.).

**New app MarkdownRenderer does NOT reach our claimed rows (INFERRED, from `docs/markdown-renderer.md` at v0.12.0 + unchanged plugin surface):** the app's own chat/previews moved to `react-native-enriched-markdown` (pinned nightly, local patch, native rebuild for grammar changes). Cross-paragraph selection (#6973), code copy buttons and sideways tables land in that renderer. Our plugin claims the timeline rows and renders its own components, so our rows keep our rendering — those features do not arrive free, and there is no plugin API to inherit them.

**Plugin QoL fixes in 0.12 (CHANGELOG.md, PROVED as entries):** chat outline jumps to timeline-plugin prompts (#6690); Find matches timeline-plugin text (#7253); Escape closes plugin preview before stopping the agent (#7110); `paseo plugin reload` no longer times out at 60 s (#6306); plugin ACP follow-ups no longer fail on prompt.steer (#7270); `providers.waitForReady` fixed on mobile (#6760); late plugin pills stop covering Copy/Fork (#7341).

## 4. Daemon changes relevant to the fleet

**Claude provider is the churn centre (PROVED stat): 19 files, +2,341/−124.**

- `providers/claude/agent.ts` +429/−: context-window handling reworked — `extractContextWindowSize` now takes the model id, `getClaudeContextWindowMaxTokens` replaces `findClaudeModel(...).contextWindowMaxTokens`, and `contextUsage.setInitialContextWindowMaxTokens` is called when the runtime model changes mid-session. New `agent.context-window.test.ts` (+218).
- Whether the **effective auto-compact window** semantics themselves changed: NOT CONFIRMED — the diff lines around it are per-model window extraction; overlay 11's exact anchor must be re-checked by the patch helper.
- `model-discovery.ts` new (+89) — models from wrapper-script providers no longer hidden (#7209); `model-manifest.ts` — Mythos 5.1 (#6403); `rewind.ts` +70 — rewind with `CLAUDE_CONFIG_DIR` (#6325); `question-response.test.ts` new (#6936 malformed answers discarded questions); `agent.live-settings.test.ts` new (mid-turn settings changes; #7179 thinking+mode change killed the command).
- `sidechain-tracker.ts` +28 and `agent.background-subagent.test.ts` +176 — background Claude subagent cards staying empty fixed (#6242, #7266). Same neighbourhood as our overlay 9 — see §6.

**Pi provider is quiet (PROVED stat):** `providers/pi/agent.ts` +11, `rpc-types.ts` +1; `runtime.ts` and `cli-runtime.ts` unchanged. Extension fixes: tintinweb-pi-subagents turn limit (#6594, extension +3 lines +150 test), Pi thinking level updates when an extension changes it (#6741). Good news for overlays 4, 8 and the Pi side of 10.

**OMP runtime (PROVED stat):** `providers/omp/agent.ts` reworked (146 ±, autocompact mentions touched), `usage-poller.ts` +11 — manual `/compact` progress and stale context meter (#6106); follow-ups to idle OMP agents start them (#7169).

**Schedules (PROVED, `server/schedule/service.ts` +201):** due slots are claimed and the cursor advanced in one serialized update; `advanceNextRunAtPast` skips accumulated past slots; final-run handling. Fixes: a schedule never running again after one unrecordable run (#6334) and shared-cron-minute double-run/skip (#6532).

**Child-agent lifecycle (PROVED):** `create-agent-lifecycle-dispatch.ts` reworked — worktree creation normalised to `NormalizedGitOptions` with new `background` + `callerWorkspaceId` + `setupContinuation` plumbing (background workspaces). `lifecycle-command.ts`: internal agents archive to `record: null` (no stored record left). Parent-notification fixes: parent no longer misses a fast child's finish (#6008) and is no longer told a child finished when it was stopped or reloaded (#6660).

**MCP send/prompt paths (CHANGELOG PROVED, code INFERRED):** messages one agent sends another through the CLI or MCP now steer the running turn instead of interrupting it (#5164), and carry the sender's name (#6373). `mcp-server`/`mcp-parity`/`agent-mcp` test files all changed. Fleet-visible behaviour change: prompts to a running agent queue/steer rather than cancel.

**workspace-directory.ts (PROVED, full diff read):** workspaces gain a `background` flag; `matchesFilter` hides them unless `filter.includeBackground === true` or the query matches the workspace id; `listEmptyProjects` takes `includeBackground`. The bucket/running logic our overlay 9 relies on was not otherwise touched in this diff.

**Memory fixes (CHANGELOG):** plugin hosts/CLI/desktop ~1 GB growth (#6847 — the validation split, §2); daemon OOM on long OpenCode v2 streams (#6262); OOM on overlapping directory searches (#7265); `paseo agent ls` past 200 agents (#6033).

**Labels/reload:** no server file with `label` or `reload` in the name changed (name-status grep, PROVED). #7290 (subagent model/thinking/mode/context in the subagents list) is app-side.

## 5. Desktop build and install changes

**Small, contained release for the desktop wrapper (PROVED, 12 files).**

- `packages/desktop/electron-builder.yml`: the ONLY change is two `extraResources` lines adding the Linux icon. **The `mac:` block is untouched** — our unsigned-macos-build overlay's mac section faces no upstream movement.
- `packages/desktop/package.json`: version bump + one new e2e script (`test:e2e:window-startup`). **No dependency changes** — same Electron major.
- `packages/desktop/src/main.ts`: adds `protectConsoleStreams()` as the first call (EPIPE dialog fix #6639) and replaces `mainWindow.once("ready-to-show", ...)` with `showWindowWhenReady(mainWindow, { showOnLoad: process.platform === "linux" })` (Linux window never appearing, #6726). New support files `src/window/show-when-ready.ts` and `src/diagnostics/console-streams.ts`, each with tests.
- No asar/packaging config file changed (name-status list) — the app.asar layout our surgical patch pattern expects is unchanged.

**Root `package.json`: version bump only (PROVED — the whole diff is one hunk).** The `allowScripts` map in our overlay 1 faces no upstream package.json edits; but actual dependency drift rides in `package-lock.json` (NOT CONFIRMED which native modules moved — re-derive allowScripts from a real `npm install` per the overlay-1 playbook).

**New build inputs to absorb (PROVED):** the root `patches/` directory pre-existed at 0.11.1 and is applied by the existing `postinstall: node scripts/postinstall-patches.mjs` script (package.json:47) — same mechanism, no new build step. The patch-set delta v0.11.1→v0.12.0: `react-native-markdown-display@7.0.2` and `react-native-uitextview@2.2.0` patches REMOVED; `react-native-enriched-markdown@1.2.0-nightly-20261014` (the new renderer, upstream PR #997) and `@gorhom/bottom-sheet@5.2.14` patches ADDED. Native dependency rebuilds are required when highlighting configuration changes (docs/markdown-renderer.md) — our 0.12-df build does one anyway.

## 6. Things 0.12 retires, duplicates or conflicts with what we carry

Against the 11 overlays in `des/overlays/README.md` (apply-checks belong to o1.2.1; these are the semantic findings):

- **Overlay 10 (pi-mcp-labels) — the display helper moved under our feet (PROVED):** `packages/protocol/src/tool-call-display.ts` was rewritten: `buildToolCallDisplayModel` early-returns a `paseoDisplay` for Paseo tools/agent messages before the ordinary name mapping, and the Paseo-leaf special case was removed from `humanizeToolName`. Our "explicit label before ordinary name mapping" insertion point no longer exists as-is; the label-carry paths (extension adapter, live emission, history replay) need re-checking against the new presentation module. Highest-value re-anchor.
- **Overlay 9 (claude-stale-subagent) — upstream keeps working the same seam (PROVED):** `sidechain-tracker.ts` changed, background-subagent card fixes (#6242/#7266), and #6660 stops parents being told a stopped/reloaded child finished — a cousin of our stale-row class. Nothing seen retires our completion/cancellation behaviours; retain and re-verify.
- **Overlay 11 (claude-auto-compact-window) — neighbourhood reworked (PROVED churn, NOT CONFIRMED semantics):** context-window extraction restructured around `getClaudeContextWindowMaxTokens` and per-model usage entries in `providers/claude/agent.ts`. Re-check the effective-window anchor.
- **Overlays 4/8 (pi compaction hold/status) — quiet (PROVED):** Pi compaction code moved ~11 lines in `agent.ts`; nothing structural.
- **Overlays 3/5 (MINE/SUB labels) — code quiet, concept stirred (INFERRED):** no server label file changed and `packages/app/src/sidebar-nav` had ZERO files changed. But background workspaces (#5039) create a second hidden-workspace class with its own sidebar filter — decide how SUB-labelled agent-created workspaces and `background` workspaces relate so the two hiding mechanisms don't fight in the sidebar.
- **Overlay 6 (reload-wait) — quiet (PROVED):** no reload-named server file changed.
- **Overlay 1 (unsigned-macos-build) — mac: block untouched; root package.json untouched (PROVED); allowScripts re-derive still needed on the new lockfile (routine).**
- **Overlay 2 (acp-context-meter) — stays retired; 0.12's context-meter fixes (#6703/#6814/#6767) are in the Claude provider, not the ACP meter we patched (PROVED paths).**
- **Nothing in 0.12 duplicates the semantic-markdown plugin** — built-in plugin changes are Hoplite provider + usage-source fixes only (`plugins/` root, PROVED name-only).
- **Rollout note:** `paseo run --background` is deprecated for `--no-wait`, and `paseo permit allow/deny` now exit non-zero on a 15 s daemon-confirm timeout (CHANGELOG "Before upgrading"). Any fleet script or muscle memory using those flags/exit codes needs the update.

## 7. Config migration / breaking changes in ~/.paseo/config.json

**No breaking shape change found (PROVED in `packages/server/src/server/persisted-config.ts` diff):**

- `voice` in the speech feature relaxed from a fixed enum to any non-empty string (#6060, self-hosted OpenAI-compatible servers).
- `trustedProxies` and the `serviceProxy` shim fields gained `.describe()` annotations — that is fix #6621, the published JSON schema rejecting valid `agentProfiles`/`plugins`. The runtime schema already accepted them in 0.11.1 (`agentProfiles` grep counts identical at both tags).
- The schema stays `.strict()`; no key removed or renamed; `agents.providers`, `plugins`, `pluginsEnabled` all still first-class. No migration action beyond what 0.11 already needed.
- `pluginsEnabled` still defaults to false at runtime (`config.ts:627`) — it must be `true` in `~/.paseo/config.json` or semantic-markdown will not load after the upgrade. This remains the silent-failure trap.
- Symlinked `config.json` is no longer replaced by a regular file on save (#6023). The fix is NOT CONFIRMED in `persisted-config.ts`'s first 150 diff lines — it lives elsewhere in the save path; trust the changelog entry.
- Deeper hunks of `persisted-config.ts` beyond line 150 of diff were not read (NOT CONFIRMED exhaustive), but the name-status list shows no other config-schema file.

## 8. Risk list for the custom build (high → low)

1. **HIGH — Overlay 10 anchor (pi-mcp-labels):** `tool-call-display.ts` rewritten around `paseo-tool-presentation/`; Paseo-name special case removed from `humanizeToolName`. Our label precedence must be re-anchored and re-tested, or MCP `Server > Action` labels silently lose to the new presentation path.
2. **HIGH — Claude provider churn vs overlays 9 + 11:** `providers/claude/agent.ts` +429, `sidechain-tracker.ts`, background-subagent fixes, context-window restructure. Upstream is actively fixing cousins of the bugs our overlays cover — after the carry, re-prove both overlays against the new code, and re-check whether 0.12's fixes retire any part of overlay 9.
3. **MEDIUM-HIGH — Build pipeline changes:** protocol zod-aot generation is now multi-file and must run in our desktop build (a stale protocol `dist` ships the leaky validator); patch-set delta swaps the markdown engine (react-native-markdown-display → react-native-enriched-markdown nightly, applied by the existing postinstall script); allowScripts re-derivation on the 0.12 lockfile.
4. **MEDIUM — pluginsEnabled silent disable:** still false-by-default (`config.ts:627`). If the upgrade is done by copying a config without `pluginsEnabled: true`, semantic-markdown vanishes quietly. Procedural guard on every machine we upgrade.
5. **MEDIUM — Background workspaces vs SUB/MINE labels:** new `background` workspace flag + `includeBackground` filters change what workspace listings return by default; our labels and any fleet tooling that reads workspace lists must agree with the new hiding rule (interaction UNDECIDED, see §6).
6. **MEDIUM — Our claimed rows miss the new renderer:** chat selection/copy/table gains (#6973) land only in the app's `MarkdownRenderer`; semantic-markdown rows keep our own rendering. Expected, but set expectations — and note the plugin now installs more easily (#7023) and re-vendoring highlight is trivial this cycle.
7. **LOW-MEDIUM — Fleet behaviour: MCP send now steers (#5164)** instead of interrupting, with sender names (#6373). Not a build risk; changes how agent-to-agent prompts behave mid-turn, so any fleet choreography that relied on interrupt-by-prompt needs a look.
8. **LOW — CLI surface:** `--background` → `--no-wait` deprecation and `paseo permit` non-zero exits — audit scripts at rollout.
9. **LOW — Schedules:** #6334/#6532 change slot accounting for the better; watch the first scheduled runs after upgrade.
10. **LOW — Everything else** (WS 100 MB limit, memory fixes, `paseo agent ls` 200 cap, desktop Linux fixes) is pure gain for the fleet.

---

_Method note: every claim marked PROVED was read directly in `git diff`/`git grep` output from the `/Users/des/dev/paseo` repository (tags v0.11.1…v0.12.0 verified present) or in the v0.12.0 worktree at `/tmp/paseo-v012-changes`. INFERRED items are judgements from that evidence; NOT CONFIRMED items are explicitly unproven. Patch-apply results are intentionally out of scope (ticket o1.2.1)._
