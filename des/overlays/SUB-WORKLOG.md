# SUB workspace-label overlay — worklog

Task: agent-created agents (non-app traffic) that are alone in their workspace get the SUB workspace label. Parent reviewer: Paseo Fixer Guy. Branch 0.10.3-df. No commit.

## Recon (done)

- Prior art: `session.ts:6359 applyOwnerMineLabel()` — fire-and-forget `setAssignment({workspaceId, label:{name,color}, assigned:true})`, `.catch` → `sessionLogger.warn`. Session stores hello `clientType` (`this.clientType`).
- Label service: `workspace-labels/internal/service.ts` `setAssignment` — re-assign is a no-op; creates definition if missing; throws `workspace_not_found` on missing/archived workspace (must be caught, never propagate).
- Valid colors: `packages/protocol/src/workspace-labels.ts` WORKSPACE_LABEL_COLORS. SUB → `sky` (MINE is `indigo`). No catalog-creation code needed.
- Create paths found:
  1. `session.ts` `handleAgentCreation` (~:3997, `agent.create.request`) — `applyOwnerMineLabel(creation.agent?.workspaceId ?? creation.workspaceId)`.
  2. `session.ts` `handleCreateAgentRequest` (~:4162, `create_agent_request`) — `applyOwnerMineLabel(agent.workspaceId)` after `createRequestedAgent`/`createSessionAgent`.
  3. `paseo-tools.ts` `create_agent` (~:1468) — `await createAgentCommand(...)` → `{ snapshot }`.
  4. `schedule/service.ts` `runSchedule` (~:897) — `await this.createAgent({...})` → `created.snapshot`, fresh `workspace.workspaceId`.
- Occupancy check: `agentManager.listAgents()` returns non-archived agents (archived are deleted from the live map, agent-manager.ts:3698). Filter `id !== agentId && workspaceId === workspaceId`.
- Wiring: `workspaceLabelService` created in bootstrap.ts:873. ScheduleService built at :1338 and `PaseoToolHostDependencies` at :1370 — both after 873, so the service can be passed into both dep objects. session.ts already holds it.
- Test harnesses: `session.test.ts:5835` "owner MINE workspace label overlay" (creationService mock + label recording service + `createSessionForTest` stubs `agentManager.listAgents`); `schedule/service.test.ts` has `createScheduleService` + `service.tick()` reaching the create path. paseo-tools has **no** create_agent test harness → skip tests there per brief.

## Plan

- Helper: `packages/server/src/server/workspace-labels/sub-label.ts` — `maybeApplySubLabel({ agentId, workspaceId, agentManager, workspaceLabelService, logger })`. Home = workspace-labels module: type-only imports (no cycles), importable by session, agent tools, and schedule; label concerns stay in the label module.
- RED: 4 session tests (sibling describe "agent-created SUB workspace label overlay") + 1 schedule test ("a schedule-created agent alone in its run workspace gets the SUB label").
- GREEN: wire session.ts (2 sites + small private wrapper guarding clientType), paseo-tools.ts, schedule/service.ts (+ option), bootstrap.ts (pass label service into both dep objects).

## RED (done 2026-10-05)

- `npx vitest run packages/server/src/server/session.test.ts --bail=1` → FAIL: "a cli session creating an agent alone in its workspace labels the workspace SUB" — setAssignment 0 calls. 152 others passed (MINE untouched).
- `npx vitest run packages/server/src/server/schedule/service.test.ts --bail=1` → FAIL: "a schedule-created agent alone in its run workspace gets the SUB label" — setAssignment 0 calls. 13 others passed.
- RED is behavioral (helper exists, unwired), not an import crash.

## GREEN (done 2026-10-05)

- Wired `session.ts`: import + private `applySubLabelForAgentTraffic(agentId, workspaceId)` wrapper (guards `clientType === "mobile" | "browser"` → return, i.e. owner sessions never get SUB) + calls in `handleAgentCreation` and `handleCreateAgentRequest`.
- Wired `paseo-tools.ts` `create_agent`: call after `createAgentCommand` resolves; new optional dep `workspaceLabelService` on `PaseoToolHostDependencies`.
- Wired `schedule/service.ts`: call after `this.createAgent(...)` in the run flow; new optional option `workspaceLabelService`; widened `ScheduleAgentManager`'s existing `Pick<AgentManager, ...>` with `"listAgents"` (typecheck found the gap; runtime object always had it).
- Wired `bootstrap.ts`: passes `workspaceLabelService` into both ScheduleService deps and the tool-host deps (created at bootstrap:873, both consumers after).
- Helper's `agentManager` param is structural `{ listAgents(): Array<{id, workspaceId?}> }` — no import of AgentManager, no coupling.
- Result: 217/217 passed across session.test.ts + schedule/service.test.ts (5 new SUB tests, MINE + schedule suites untouched and green).

## Gates (done 2026-10-05)

- typecheck: only remaining error is the known foreign `packages/app/e2e/browser/plugin-timeline.spec.ts(239,79)` — untouched per brief. All my files clean.
- lint (`npm run lint --` 7 changed files): 0 warnings, 0 errors.
- format:files on the 7 changed files: clean.
- Final test run post-format: 217/217.
- Not committed, per brief. Touched only: sub-label.ts (new), session.ts, session.test.ts, schedule/service.ts, schedule/service.test.ts, paseo-tools.ts, bootstrap.ts, this worklog.

## Notes for reviewer

- paseo-tools has no create_agent test harness → no test added there (brief permits); its wiring is 1 helper call, covered indirectly by the shared helper's session tests.
- The `create_agent_request` path (handleCreateAgentRequest) shares the same wrapper as `agent.create.request`; both sites covered.
- The send-path MINE call (session.ts ~:8117) intentionally untouched — sends are not creates.

## Gates (pending)
