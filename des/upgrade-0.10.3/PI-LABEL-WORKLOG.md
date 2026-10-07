# PI-LABEL-WORKLOG — 0.10.3-df pi-mcp-adapter tool-label tweak

Owned: `packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/index.ts` + `index.test.ts`,
`packages/protocol/src/tool-call-display.ts` + `tool-call-display.test.ts` (approved widening), this worklog.
No commits / pushes / installs / builds / restarts. TDD red → green on the two test files only.

## Unit 1 — Trace (read-only) — DONE

- Adapter `mapToolCall` → `{ name }` → `agent.ts:2337` `name: mapping?.name ?? toolCall.toolName` → timeline `ToolCallBase` (`agent-sdk-types.ts:349`): fields `name`/`detail`/`metadata` only, **no display-title field**.
- Render: `packages/app/src/tool-calls/presentation.ts` (`displayDetail`) → `buildToolCallDisplayModel()` in `packages/protocol/src/tool-call-display.ts:155`. Precedence: `unknownDetailOverride ?? canonicalDetail.displayName ?? humanizeToolName(name)`.
- `humanizeToolName`: returns as-is only for names containing `: . /` or `__`; otherwise lowercases → today "Paseo > Get Agents" would render "Paseo > get agents"; current labels render literally as `paseo.list_models`.
- Claude precedent (`mcp__paseo__speak` → name `speak` → "Speak") drops the server; no Server>Action path existed. Reported; Des approved widening to protocol display file. No display-title field to be invented.

## Unit 2 — Red tests — IN PROGRESS

Planned matrix (~15): running args (explicit server+tool, prefixed `server_tool`, unknown-server prefix), completed result metadata (details server+tool, mode dispatch), gateway modes per dispatch order action > tool > connect > describe > search > server listing > status, malformed inputs → passthrough, non-MCP → passthrough, no duplicated prefixes, `list_agents` → "Get Agents", protocol regressions "Paseo > Get Agents"/"Flight-plan > Prefill" survive display, ordinary names + canonical precedence unchanged.

Red command: `npx vitest run packages/server/src/server/agent/providers/pi/extensions/pi-mcp-adapter/index.test.ts packages/protocol/src/tool-call-display.test.ts --bail=1`

Result: (pending)
