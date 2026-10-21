# OpenCode mode resume investigation

Read-only investigation. No code, config, or agent record was changed.

## Done

- [x] Skeleton created
- [x] Q1. dci launch_paseo_subagent mode mapping
- [x] Q2. flight-plan MCP launch and resume mode mapping
- [x] Q3. Paseo server create/resume path to opencode agent value, v1 and v2
- [x] Q4. Stored OpenCode records counted by mode id
- [x] Q5. How bypassPermissions first got stored
- [x] Recommended owner layer

## Pending

- Nothing. The investigation is complete.

## What happened

This is a compatibility gap across the OpenCode v1-to-v2 runtime change. It is not a
bug in new code.

OpenCode shipped a new v2 runtime. Paseo 0.10.0-beta.1 is adapting to that runtime.
Agent records written under the old runtime carry mode ids. The v2 runtime reads a
mode id as an agent name. A record that holds `bypassPermissions` therefore fails on
resume with:

```
Agent not found: "bypassPermissions". Available agents: build, explore, general, plan
```

A fresh launch that asked for `full-access` worked. It became OpenCode agent `build`
with `auto_accept=true`.

## Hook note

The session hook `TDD_RGB + BROWSER_VERIFY` was active. TDD_RGB applies to code
changes. This task makes no code changes. BROWSER_VERIFY applies to UI work. This task
has no UI. Both are recorded here and not otherwise applicable.

## Answers

### Q1. DCI `launch_paseo_subagent` mode handling

Source: `/Users/des/dev/dci-harness/src/paseo-bridge/mcp-tools/launch-paseo-subagent.ts`.
Near-identical copies sit in `dci-harness2/` and `vcc-sidecar-01/dci-harness-candidate/`.

- The tool takes a free string for mode. The schema is `mode: z.string().optional()`
  (launch-paseo-subagent.ts:126). The tool performs no per-provider validation.
- One trap check exists. When the provider key is `opencode` and the mode is exactly
  `build`, the tool refuses unless `modeForce:true` is set
  (launch-paseo-subagent.ts:182-195). Every other string passes through.
- When the caller omits mode, the default comes from the provider key:
  `unattendedModeForProvider(provider)` (spawn-helper.ts:61). The table is
  `{ claude: 'bypassPermissions', codex: 'full-access', opencode: 'full-access',
pi: 'default' }` (unattended-modes.ts:1-6).
- The mode rides the CLI argv as `--mode <value>`:
  `argv.push('--mode', input.mode)` (spawn-helper.ts:140), inside `paseo run`.
- Does it ever send `bypassPermissions`? Yes. A caller can pass
  `mode:"bypassPermissions"` for any provider, including OpenCode. The description
  invites that shape. It says to pass "the closest equivalent of their current
  execution mode", and it gives the example "Claude bypassPermissions ->
  bypassPermissions" (launch-paseo-subagent.ts:56).
- Does it map mode names per provider? No. It has one default lookup by provider key.
  All explicit values pass through unchanged.

### Q2. Flight-plan MCP mode handling

Launch code: `/Users/des/dev/flight-plan/src/adapters/paseo/transport.ts`.
`createAgent` builds `paseo run -d --json ... --mode <request.mode>`
(transport.ts:216-245, mode at :233). The request mode comes from the clearance type
rating: `mode: clearance.typeRating.mode` (runtime/index.ts:3348). The transport does
no per-provider mapping.

The per-harness mapping lives upstream in
`/Users/des/dev/flight-plan/src/jail/actions.ts:616-638`. `UNATTENDED_MODE_BY_HARNESS`
maps `opencode` to `full-access`, and `claude` or `claude-code` to
`bypassPermissions`. `unattendedLaunchShape` pins that mode into `settings.modeId`.
That patch applies to the native create fired by an engineer or mechanic. It does not
apply to the seat-clearance launch.

Pinned type ratings in the source:

- OpenCode seats pin `mode: 'full-access'` (runtime/index.ts:2427, mcp/server.ts:2179).
- Claude seats pin `mode: 'bypassPermissions'` (mcp/server.ts:2192).

Does flight-plan ever send `bypassPermissions` to OpenCode? Only when a clearance type
rating carried it. Flight-plan holds a guard that expects OpenCode clearance mode
`full-access` (runtime/index.ts:3494-3500). No flight-plan code maps
`bypassPermissions` to `build` plus `auto_accept`.

Resume: flight-plan has no Paseo session resume. Its `resume` MCP effect
(mcp/server.ts:1452) is engine-side. It re-engages an existing agent with
`paseo send` (transport.ts:249-261). That call carries no mode. The `rebind` tool
(mcp/server.ts:2974) rebinds the engine binding, not the provider session. It sends no
mode either.

Conclusion: flight-plan is not the source of `bypassPermissions` for an OpenCode
record. Flight-plan also cannot correct the resume.

### Q3. Paseo server create and resume path

#### Create, v1 and v2

- The CLI `paseo run --mode X` reaches `resolveCreateConfig`. Both runtimes share the
  legacy implementation: `this.resolveCreateConfig = this.legacy.resolveCreateConfig`
  (runtime-client.ts:67).
- `resolveOpenCodeCreateConfig` maps one legacy alias only. Line 250 reads
  `input.requestedMode === OPENCODE_LEGACY_FULL_ACCESS_MODE_ID`
  (opencode-agent.ts:143 defines the constant, opencode-agent.ts:247-280 holds the
  function). The alias `full-access` becomes `build` plus `auto_accept:true`
  (opencode-agent.ts:258-265). `bypassPermissions` is not mapped.
- The result goes through `resolveAndValidateCreateAgentMode`
  (create-agent-mode.ts:43-82). When `availableModes` is undefined, an explicit mode
  passes unvalidated. The comment states that rule at create-agent-mode.ts:15-17. The
  check lives at create-agent-mode.ts:49.
- The resolved config is stored as `record.config.modeId` (agent-storage.ts:13-33,
  `SERIALIZABLE_CONFIG_SCHEMA`). `persistence-hooks.ts:70` reads it back.
- v2 fresh create passes the value as the OpenCode agent name:
  `agent: config.modeId ?? "build"` (opencode/v2/agent.ts:111).

#### Resume

- A client touch reaches `ensureAgentLoaded`. It reads the record from disk
  (agent-loading.ts:95).
- `buildConfigOverrides(record)` takes `record.config?.modeId`
  (persistence-hooks.ts:66-79, mode at :70).
- `resumeAgentFromPersistence` receives those overrides (agent-loading.ts:109-115).
- The active runtime is chosen by the installed binary version, not by the record. The
  probe runs `opencode --version`. Major 1 selects the legacy client. Major 2 selects
  the v2 client (runtime-client.ts:70-100, `openCodeMajorVersion` at :28-45). After the
  v2 update, every old OpenCode record resumes through the v2 path.
- v2 resume calls `applyResumeOverrides` (opencode/v2/agent.ts:144). That function
  passes the stored id straight to the SDK as the agent name:

  ```ts
  if (overrides?.modeId) {
    await client.session.switchAgent({
      sessionID: info.id,
      agent: overrides.modeId,
    });
    info.agent = overrides.modeId;
  }
  ```

  (opencode/v2/configuration.ts:49-60, switch at :54-58). This is the failure site.

#### v1 contrast

v1 normalises the legacy alias on resume. `resumeSession` calls
`this.assertConfig(config)` (opencode-agent.ts:1527). That path calls
`normalizeOpenCodeConfig` (opencode-agent.ts:672-689). The function maps `full-access`
to `build` plus `auto_accept:true` (lines 677-688). v1 also maps the id at prompt time
via `resolveOpenCodeRuntimeAgentId` (opencode-agent.ts:662-670). v1 has no mapping for
`bypassPermissions` either.

#### Where legacy mode names are mapped today

| Place                                | What it maps                             | When                  |
| ------------------------------------ | ---------------------------------------- | --------------------- |
| `opencode-agent.ts:247-280`          | `full-access` to `build` + `auto_accept` | create, both runtimes |
| `opencode-agent.ts:672-689`          | `full-access` to `build` + `auto_accept` | v1 resume and assert  |
| `opencode/v2/configuration.ts:49-60` | nothing                                  | v2 resume             |

No layer maps `bypassPermissions` for OpenCode. No layer maps any legacy name on v2
resume.

### Q4. Stored OpenCode records

Read-only scan of `~/.paseo/agents/**/*.json` on 2026-09-28. No record was changed.

Totals: 10,072 records. 6,954 are provider `opencode`.

`config.modeId` counts:

| config.modeId     | records |
| ----------------- | ------- |
| build             | 4,134   |
| full-access       | 2,570   |
| null or absent    | 238     |
| plan              | 11      |
| bypassPermissions | 1       |

`lastModeId` and `runtimeInfo.modeId` counts: build 6,704, null 238, plan 11,
bypassPermissions 1.

The 2,570 `full-access` records keep the requested alias in `config.modeId`. Their live
fields hold `build`. The create-time alias resolution ran for them
(opencode-agent.ts:258-265).

The at-risk group under the v2 runtime is 2,571 records. Their `config.modeId` is not an
OpenCode agent name. The rest are safe. `build` and `plan` are real agents. A null mode
is absent.

#### Telling v1 records from v2 records

- The record schema has no runtime marker. `runtimeInfo.extra` is absent for all 6,954
  OpenCode records. `persistence.sessionId` equals `persistence.nativeHandle` in every
  sample. The `features` array holds only `auto_accept`.
- The runtime is chosen by a probe of the installed binary, not by the record.
  `OpenCodeRuntimeClient.client()` runs `opencode --version`. Major 1 selects the v1
  client. Major 2 selects the v2 client (runtime-client.ts:70-100).
- A record is therefore not "a v1 record" or "a v2 record". The same record can be
  created under v1 and resumed under v2. This one was.
- The best era signals are the creation date and the field shape. `full-access` configs
  exist only in June and July 2026, the v1 era. Null modes exist only in September 2026,
  the v2 default path era (opencode-agent.ts:267-271 describes that path).

#### The one bypassPermissions record

- id: `8771c96a-9447-447f-96f3-ef28060c0b97`
- title: `🧙 FP-ORCHES-8 SS7 Pi full feature parity Sector 7 recovery coordinato`
- created 2026-09-28T00:23:01.152Z, archived 2026-09-28T13:55:30.326Z
- parent label: `2f5aaeeb-3023-458b-a9b8-6bb48747c98f` (`🧐 FP-SUPER-3 dynamic-agentsmd`)
- model: `zai-coding-plan/glm-5.3-flash`, `auto_accept` true

The request expected two or three examples. The data holds exactly one.

### Q5. How `bypassPermissions` first got stored

Three facts fix the timeline.

1. The agent was created with mode `build`. The creation snapshot at
   `~/.paseo/creations/9eed79cc98238a43b557f0f36f66efc833c433cc7d33a52cda37850c3f85b9a3.json`
   shows `currentModeId: build`, `availableModes: ["build", "plan"]`, and
   `persistence.metadata.modeId: build`. The snapshot and the record share one
   `createdAt`.
2. The record now holds `bypassPermissions` in `config.modeId`, `lastModeId`,
   `runtimeInfo.modeId`, and `persistence.metadata.modeId`.
3. No config RPC for this agent appears in the retained daemon logs. The logs cover the
   full life of the agent. There is no `set_agent_mode_request` and no
   `agent.config.apply.request` for it. The only writes are the create at 00:23, a slash
   timeout at 00:28, label updates at 07:35 and 13:53, and the failures at 13:49 to
   13:54. `update_agent_request` carries only a name and labels (session.ts:2715-2716,
   session.ts:3354-3358). It cannot set a mode.

The most likely path is the native Paseo tool `set_agent_mode`. The chain:

1. The tool is registered at paseo-tools.ts:3103-3125. Its description names
   `bypassPermissions` as an example mode (paseo-tools.ts:3108). The description is
   provider-agnostic. The tool calls `setAgentModeCommand` (paseo-tools.ts:3119).
2. `setAgentModeCommand` is a thin wrapper. It performs no validation
   (lifecycle-command.ts:210-215).
3. `AgentManager.setAgentMode` writes the mode into the live config and emits state:
   `agent.config.modeId = currentMode` and `runtimeInfo.modeId = currentMode`
   (agent-manager.ts:1919-1928).
4. Under the v1 OpenCode client, `setMode` stores any string except the `full-access`
   alias. It makes no server call and performs no validation:

   ```ts
   this.currentMode = normalizedModeId;
   this.config.modeId = normalizedModeId ?? undefined;
   ```

   (opencode-agent.ts:4917-4927). Under v2 the same call fails at `switchAgent` first
   (v2/session.ts:266-270). The write therefore happened while v1 was live.

5. The state event flushes the record. `persistence-hooks.ts:70` reads
   `record.config?.modeId`. `agent-storage.ts:15` stores it.

The caller knew the agent id. The likely callers are the seat itself, through its own
`PASEO_AGENT_ID`, or its parent FP-SUPER-3. The tool is exposed to agents with the Paseo
bridge (`supportsNativePaseoTools`, v2/agent.ts:56). The description invites
`bypassPermissions`. v1 accepted it.

Evidence limit: the tool call is not in the daemon log. It appears only in the agent
timeline, which is not on disk. The path above is the one setter that fits all three
facts. A WS `set_agent_mode_request` and a client resume override would each leave a
log line. Neither exists.

### Recommended owner layer

Map the old mode ids in the OpenCode provider boundary, at `OpenCodeRuntimeClient`
(`packages/server/src/server/agent/providers/opencode/runtime-client.ts`).

That class is the one choke point every OpenCode session crosses. Both `createSession`
(runtime-client.ts:114-122) and `resumeSession` (runtime-client.ts:123-131) go through
it, for v1 and for v2. One small normaliser there covers every caller: the CLI, the
desktop app, the mobile app, DCI launches, flight-plan launches, and the native tools.

The rule for the normaliser:

- `full-access` becomes `modeId "build"` plus `auto_accept: true`. The existing alias
  behaviour already does this (opencode-agent.ts:258-265, opencode-agent.ts:677-688).
- `bypassPermissions` becomes the same result. It is a Claude Code mode name. It has no
  meaning on OpenCode. Claude Code records keep using it and are not affected.
- Any other value passes through. `build` and `plan` are real OpenCode agents.

Do not put the fix only in `applyResumeOverrides` (configuration.ts:49-60) or only in
the v2 create (agent.ts:111). That pair covers v2 alone, in two places. The facade
covers both runtimes and both directions in one place.

For records already on disk, the same normaliser gives backward safety on the next
load. No record rewrite is needed. The 2,570 `full-access` records are the large part
of that at-risk group. No `full-access` failure appears in the retained logs.
