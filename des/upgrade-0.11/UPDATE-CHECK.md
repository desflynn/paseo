# Paseo 0.11 update check (2026-10-07, report only)

Base today: branch 0.10.3-df (v0.10.3 + overlays). Upstream: v0.11.0 (22488d450, cut 2026-10-07 15:27 CEST), 232 commits past v0.10.3; upstream/main is 9 commits past it.

## Overlays vs v0.11.0

Method: throwaway worktree at `v0.11.0` (22488d450), one `git apply --3way` per patch, freshly re-created each time. Results are per-patch on vanilla v0.11.0; stacking order still matters (see notes). All 9 checked.

| #   | Overlay               | Verdict                 | Detail                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | unsigned-macos-build  | ✅ APPLIES              | Clean on v0.11.0. Re-derive `allowScripts` versions after `npm install` on the new dep tree (README §1: versions are reference only).                                                                                                                                                                                                                                                                |
| 2   | acp-context-meter     | 🗑 RETIRES              | Upstream `48329facc` is in v0.11.0 (verified `git tag --contains` → v0.11.0). Upstream does the same job with input validation; drop ours.                                                                                                                                                                                                                                                           |
| 3   | mine-label            | ✅ APPLIES              | Clean. No upstream "workspace label" commits in v0.10.3..v0.11.0 — nothing close to supersede.                                                                                                                                                                                                                                                                                                       |
| 4   | pi-compaction-hold    | ✅ APPLIES              | Clean. No upstream commit surfaces failed Pi compactions (`--grep=compact` → only #6295 and omp #6215, unrelated).                                                                                                                                                                                                                                                                                   |
| 5   | sub-label             | ⚠️ CONFLICT             | `session.ts` (3 hunks: the 2 call sites after agent-create and send_agent_message, plus the helper block) + `session.test.ts`. Upstream rewired Session — `792715e76` (usage sources as plugins, #5465) and `3a9304607` (sidebar plugin items, #5685). Not superseded. Re-anchor the two `applySubLabelForAgentTraffic` calls and helper at the new create/send sites.                               |
| 6   | reload-wait           | ⚠️ CONFLICT (test only) | `agent-manager.ts`, `agent-manager.test.ts`, `session.ts` apply clean; only `session.test.ts` conflicts (`792715e76` touched it). Re-anchor assertions.                                                                                                                                                                                                                                              |
| 7   | pi-worktree-trust     | ✅ APPLIES              | Clean on vanilla v0.11.0 (`cli-runtime.ts`, `cli-runtime.test.ts`, new `pi-project-trust.ts`; exit 0). The earlier "does not apply" was a 3way blob miss — the patch was cut on the overlay stack, so git falls back to direct application (which succeeds).                                                                                                                                         |
| 8   | pi-compaction-status  | ⚠️ CONFLICT (test only) | `pi/agent.ts` applies clean; only `pi/agent.test.ts` conflicts (upstream `1f8a4559a` #6090, `97083dd73` #6061, `5eb4c8afa` #5975, `29c198f95` #5780, `4417d7c47` #5762 all touched it). Not superseded — no upstream fix for surfacing failed compactions.                                                                                                                                           |
| 9   | claude-stale-subagent | ⚠️ CONFLICT (test only) | Sources clean (`agent.ts`, `subagents/live-source.ts`, `agent.sub-agent-sidechain.test.ts`); conflicts in `agent.subagent-interrupt.test.ts` + `subagents/live-source.test.ts`, both moved by `8ddeb79c8` (#6295 background-helpers rework). Not superseded, but #6295 reworked the same interrupt/background-subagent area — re-check the overlay's intent against the new behavior when resolving. |

Notes:

- **Patch hygiene:** sub-label's session.ts hunks carry MINE-overlay lines (cut on the stacked 0.10.3-df tree), which is why its 3way misses blobs and why conflicts look bigger than the change itself. On the new base, cut each overlay as a clean per-overlay diff (regenerate from the stacked branch per overlay, or re-commit overlay-by-overlay) so future 3ways resolve.
- **Stacking:** apply in README order; sub-label and reload-wait both touch `session.ts`, so resolve sub-label first, then reload-wait's session.ts hunk (it applied clean on vanilla, but anchors shift after sub-label lands).
- No overlay is superseded upstream in v0.11.0 except acp-context-meter.

## Changelog highlights

Full 0.11.0 section read from /tmp/changelog-0.11.0.md. The 12 that matter to Des:

- **Plugin install semantics changed (migration):** `paseo plugin add owner/slug` now installs from the plugin registry; local directories need a path (`./slug`) and GitHub needs `github:owner/repo` (#6224). Affects how we install semantic-markdown on every machine.
- **Plugin SDK gains sidebar header/footer items and full screens** (#5685). The SDK now owns sidebar real estate — relevant to Des's stop-time/footer ambitions without core builds.
- **Plugin SDK process + audio powers:** `spawnProcess()` / `execCommand()` / `terminateProcess()` incl. Windows `.cmd`/`.bat` (#6151), and `client.playAudio()` on every client (#5976) — playAudio could replace our plugin's read-audio RPC workaround for MP3 playback.
- **Plugin loading fixes:** plugin reload no longer injects `[System Error] Provider connection closed` into finished chats (#5579); npm imports declaring only `main`/`module` now resolve (#5838); `plugin add .` looks in the right directory (#6239).
- **Registry listings:** plugin manifest gains display name, icon, screenshots, videos (#6263); `paseo plugin init` writes an `OVERVIEW.md` template (#6226).
- **`agent.closed` plugin lifecycle event** (#5971).
- **Usage arrives as built-in plugins** — sidebar footer/sheet, per-account quota windows, ChatGPT + Claude login discovery incl. macOS keychain (#5465, #5685, #5844, #5975…). This is the daemon-side Session rewiring that conflicts our sub-label and reload-wait overlays.
- **Claude: background helpers stay idle; send/Stop no longer kills them** (#6295) — big rework of the same interrupt/subagent area our claude-stale-subagent overlay patches (its test conflicts).
- **ACP context meter fixed upstream** (#4848) — retires our acp-context-meter overlay.
- **Pi provider:** built-in MCP servers even without `pi-mcp-adapter` (#5762); live subagent transcripts while running (#5755); sessions whose model was removed reopen (#6061); extension context shows as expandable tool rows (#6090).
- **OpenCode v2:** agents no longer stay running after a dismissed question or denied permission (#6177, #6188); slow-server first-prompt timeout fixed (#5873). We pin v1, but these are daemon-side.
- **Config defaults + mobile:** `agents.providers.<id>.options` as provider-level default options with per-agent overrides (#5780) — relevant to model-catalogue work like Luna's thinking options; tablet terminal key bar + paste (#5712) and Android sidebar scroll fix (#6058).

## Plugin SDK / third-party plugins vs our semantic-markdown plugin

### Does our plugin load on 0.11 unchanged? Yes.

- The client SDK diff is purely additive; the old APIs our plugin doesn't even use stay as deprecated aliases — `COMPAT(pluginSidebarAliases): added in v0.11.0, remove after 2027-03-29` (`packages/plugin/src/client/contracts.ts:125`).
- The timeline-transformer API our plugin is built on is untouched: `PluginTimelineTransformerContribution` / `PluginTimelineItemProps` still exported from `client/index.ts`; one mention in the whole `packages/plugin` diff. Our plugin's only client surface is two `addTimelineTransformer` calls (`des/plugins/semantic-markdown/index.client.tsx:85,158`).
- Imports are type-only (`index.client.tsx:1`, `index.server.ts:1`), so nothing recompiles against changed signatures.
- Manifest `requirements.paseo: ">=0.9.2"` (`paseo-plugin.json:4`) is satisfied by 0.11.0; the new manifest fields (#6263 display name, icon, screenshots, videos) are optional additions.
- Successor repo `~/dev/paseo-semantic-renderer-plugin` has the same shape (index.client.tsx / index.server.ts / paseo-plugin.json, `@getpaseo/plugin` 0.9.2) — same verdict.

### What needs attention (nothing breaks outright)

- **`pluginsEnabled` gate (new):** "Installed plugins are disabled unless `pluginsEnabled` is `true`" (`docs/plugins.md:39` at v0.11.0). Set it in daemon config or semantic-markdown silently won't load after upgrade. Built-in plugins are exempt.
- **Vendored `@getpaseo/highlight` drifts:** our plugin depends on it via `file:../../../packages/highlight`; upstream changed it +335/−79 including a new Vue parser. Re-vendor on the new base or lose Vue highlighting (cosmetic, not a load-break).
- Bump the `@getpaseo/plugin` devDependency to 0.11.0 only when adopting new APIs below.

### How third-party install works on 0.11

- `paseo plugin add owner/slug` installs the reviewed artifact from the plugin registry (browse: paseo.sh/plugins). Local directories need a path (`./slug`); Git sources are `git:owner/repo`, `github:owner/repo` or a full URL, with `:relative/path` for monorepo subdirectories and `--ref` for the initial ref (#6224). npm sources still exist.
- Private registries: `PASEO_PLUGIN_REGISTRY` base override plus `pluginRegistries` bearer credentials in daemon config (startup settings; daemon restart to apply).
- Publishing: the open registry protocol (getpaseo/plugins `PROTOCOL.md`) + `public-docs/plugins/publishing.md`; `paseo plugin init` now writes an `OVERVIEW.md` listing template (#6226) and the manifest takes display name, icon, screenshots, videos (#6263). Registry overviews render only through `@getpaseo/protocol/plugin-overview` (no raw HTML, HTTPS-only).

### New SDK things we could use

- **`client.playAudio({ base64, mimeType })`** (`contracts.ts:135`) — plays audio on every client, resolving at playback end. Can replace our plugin's `read-audio` RPC + Blob/WebView workaround for MP3 playback (Joey's pending desktop play test gets simpler).
- **`addSidebarHeaderItem` / `addSidebarFooterItem` + `addScreen` (with URL params) + `openPopover`** (`contracts.ts:137-139`) — real sidebar real estate and full screens for plugins.
- **Server:** `spawnProcess()` / `execCommand()` / `terminateProcess()` (`server/process.ts:48,76`), the `agent.closed` lifecycle hook (`server/lifecycle.ts:63`), and usage sources (`server/usage.ts`).
- **Still no turn-footer or message-decoration hook in 0.11.** The timeline transformer remains the only message-level lever (we already use it); the stop-time footer stays core-side via Overlay 10. Sidebar footer items are the closest new surface.

## Verdict

- **Rebuild is tractable.** Branch `0.11.0-df` from v0.11.0: 4 overlays apply as-is (unsigned-macos-build — re-derive `allowScripts` after `npm install`; mine-label; pi-compaction-hold; pi-worktree-trust), 1 retires (acp-context-meter), 4 need small hand-resolves (sub-label: re-anchor session.ts call sites; reload-wait, pi-compaction-status, claude-stale-subagent: test files only). Regenerate each overlay as a clean per-overlay patch on the new base so future 3ways resolve.
- **The plugin rides free.** semantic-markdown loads unchanged; set `pluginsEnabled: true`, re-vendor `@getpaseo/highlight`, and consider adopting `client.playAudio` to retire the read-audio RPC. No manifest change required; registry metadata only if we ever publish.
- **Daemon-side gains are the real payload** — usage as built-ins, Pi MCP/subagent-transcript/model-reopen fixes, OpenCode v2 lifecycle fixes, Claude background-helper fixes — all daemon-side, which fits the rule: builds carry daemon changes only, UI stays in plugins (0.11's sidebar/screen surfaces extend what's plugin-able; turn footer remains Overlay 10).
- **Open risks:** #6295 reworked the same Claude interrupt/subagent area as overlay 9 — upstream may fix the stale-row class itself soon (watch before investing in the test resolve); session.ts stacking order (sub-label before reload-wait); silent plugin disable if `pluginsEnabled` is unset; `allowScripts` version drift on the new dependency tree.
