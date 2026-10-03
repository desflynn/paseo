# Paseo 0.10.3-df preparation

## Authority and decisions

- Des approved stable upstream v0.10.3, not upstream/main (currently 0.11.0-beta.3).
- Local main must track fork origin/main. Fork main uses stable upstream v0.10.3 for this upgrade.
- Working home: 0.10.3-df, with existing local additions cherry-picked onto stable base.
- Prepare/build only. Ask Des before installation or any live daemon restart. Never restart port 6767 during preparation.
- Pi MCP label format: <server display name> > <friendly action>, consistently including Paseo. No literal MCP prefix. Gateway search/list/connect/describe/status must have identifiable actions and server where known.

## Initial state

- Repository /Users/des/dev/paseo; original branch 0.10.1-df at ab43c79d1.
- Stable v0.10.3 target b4af508e2a9e5a34a8b0ffb8dfaff6fd679da6c7.
- origin github.com/desflynn/paseo.git; upstream github.com/getpaseo/paseo.git.
- main and origin/main initially c5236c00d (v0.10.1); main incorrectly tracks upstream/main.
- Foreign/uncommitted state: CLAUDE.md +63 lines; untracked .claude/handoffs/ and .codex/. Preserve; do not stage or delete.
- Context-mode tools unavailable in this session. Keep inspection output bounded; no raw logs/secrets.

## Existing DF commits in replay order

1. 810245a90 unsigned macOS builds
2. b9c802b5e ACP context-meter usage window
3. 4919338b3 install-script approvals
4. c86556918 msgpackr install-script approval
5. 3dcb15823 render-probe plugin
6. ce52ee52b semantic Markdown plugin
7. 02cb04c05 semantic report composition
8. acc205dbb path links via pane handler
9. d98e18d1a remove path-link debug line
10. ab43c79d1 local images/lightbox

## Active helper

- Pi label helper: 099587da-7fa0-4a2a-956b-35f63d7bca45, pi/zai/glm-5.3-flash high, same workspace wks_fb51e963694dbea1. Completed read-only tracing; parent cancelled it and took over edits because the narrow task was taking too long. No source edits made by helper. Helper archived after harvesting trace.

## Done

- Confirmed upstream stable 0.10.3 and obtained release refs.
- Inspected branch history, remotes and local worktree state.
- Des selected stable base and explicitly reserved installation approval.
- Received Pi label diagnosis: packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/index.ts ignores gateway discovery/management operations.

- Backed up CLAUDE.md and its diff; stored pre-upgrade plugin tree hashes.
- Created 0.10.3-df from v0.10.3; foreign guidance change preserved automatically.
- Replayed all ten DF commits successfully; branch tip 7b23def35.
- Local main fast-forwarded to b4af508e2 (peeled stable v0.10.3), tracks origin/main. Fork main and 0.10.3-df pushed successfully; DF branch tracks origin/0.10.3-df.
- Both plugin Git tree hashes unchanged: semantic-markdown b58a0bb1c8cdefedef21be999f28a48d96f5dfda; render-probe 4695edcdc6b485b5a858fa280599fc275d3157e0. Working plugin sources clean.
- Lockfile differs only in 12 root/workspace entries; zero external dependency changes. Existing node_modules sufficient, no install required.
- Initial npm run typecheck clean (log /tmp/paseo-0103-typecheck.log).
- npm run lint reports 1,243 errors, zero warnings (log /tmp/paseo-0103-lint.log). Classify before proceeding; no unrelated lint fixes.

- Core-only npm run lint -- packages passes: zero warnings/errors across 4,289 files. Full-lint diagnostics point to unchanged des/plugins/render-probe; no unrelated fixes.
- Label TDD: protocol test red (Paseo > get agents vs desired title case), adapter test red (paseo.list_models vs desired server/action label); logs /tmp/paseo-0103-label-red.log and /tmp/paseo-0103-adapter-red.log.
- Initial label implementation used name and a preservation rule; review caught that this loses canonical Paseo grouping/detail identity. Replaced before commit with an optional displayName on the internal Pi extension mapping, persisted in existing metadata.toolDisplayName. Shared display reads that override; canonical names and normal humanisation remain intact. No wire/schema changes or dependencies.
- Added live emission and history replay regressions. Final focused tests: 38 adapter/history/display plus 1 selected live-emission test pass (39 total). Identity correction first established red in protocol display test; /tmp/paseo-0103-identity-red.log. Green logs /tmp/paseo-0103-identity-green.log and /tmp/paseo-0103-live-label-test.log.
- Green: both focused suites, 33 tests pass, /tmp/paseo-0103-label-green.log.
- Unknown server uses Gateway > Action; server-only operation labels Server > List Tools. Existing actual-call server-prefix inference retained; completion metadata resolves canonical server.

- Scoped npm run format:files applied only to four changed source/test files (full-tree format avoided because foreign guidance and carried plugin sources must stay unchanged).
- Final typecheck passed after label implementation. Lint found function complexity 23 > 20; extracted completedTool validation, then core lint passed and adapter refactor suite passed.
- Initial unsigned ARM64 directory build completed exit 0. Verified app version 0.10.3 and original label code in ASAR. Superseded by corrected build below.
- Browser regression added to existing overview-sheet suite. Playwright cached Chromium runtime missing; no browser install performed. Used installed Google Chrome with /tmp/paseo-0103-playwright.config.ts, fresh isolated profile, existing E2E fixtures blocking live :6767. Initial browser label test passed, screenshot /tmp/paseo-0103-pi-label.png. Rerun after identity correction will additionally assert Paseo grouping.
- Corrected unsigned root build started: CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:desktop -- --mac --arm64 --dir --publish never. Supervisor PID 26574; log /tmp/paseo-0103-corrected-build.log; exit /tmp/paseo-0103-corrected-build.exit. No app install, publish or live restart.

## Verified artifact

- Corrected build exit 0; log /tmp/paseo-0103-corrected-build.log.
- App: /Users/des/dev/paseo/packages/desktop/release/mac-arm64/Paseo.app.
- Info.plist version: 0.10.3. Unsigned ARM64 directory artifact; publishing disabled.
- ASAR SHA256: c0dede2de3091956cac8c8dca0a280808dba9a6262bd7b5836b5a560c80dd2cd.
- Verified bundled Pi MCP adapter, shared display helper, live emission and history mapper all contain corrected metadata-label path.
- Post-build npm run typecheck passes; npm run lint -- packages passes; git diff --check passes.
- Isolated browser regression passes (17.3s), asserting both exact Paseo > Get Agents title and Called Paseo grouping. Screenshot /tmp/paseo-0103-pi-label.png, inspected by parent. Log /tmp/paseo-0103-corrected-browser.log. Mock stream, not installed app/device UAT.
- Plugin tree hashes and local CLAUDE.md content still identical to pre-upgrade fingerprints.
- Full lint remains blocked by inherited render-probe/generated JS errors. No unrelated cleanup.
- Build emits inherited electron-builder duplicate-reference/deprecation notices and expected unsigned-signing warnings; succeeds.

## Delivery

- Commit and push only ten owned label/test files plus this working log; leave foreign guidance, local backups and helper journal untouched.
- Stable main and DF scaffold already pushed to fork. Remaining commit carries Pi label change as a separate local patch above the ten replayed commits.

## Pending owner decision

- Ask Des before installation or any live daemon restart. No permission granted yet.
- Installed app and live daemon have not been changed. Next step after approval: check installed version, prepare rollback bundle, then provide bounded installation commands. Do not infer approval from preparation.
