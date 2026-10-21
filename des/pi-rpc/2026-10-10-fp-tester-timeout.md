# FP-TESTER prompt timeout trace

## Scope

Des's screenshot: `[System Error] Pi RPC request timed out phase=prompt elapsedMs=60333 timeoutMs=60000`. Adjacent extension peer-dependency and duplicate builtin/external MCP registration warnings are not cause evidence. Read-only Paseo RPC trace; preserve UAT tasks and 12 children. No restart, new inference, adapter disabling or unrelated edits.

## Verified

- Live agent: 9cd8da13-6a35-4ff3-ae40-81805a315ae7, FP-TESTER UAT the dynamic operation.
- Workspace: wks_be49b4e84d68452b, cwd /Users/des/dev/dci-harness.
- Provider Pi, model openai-codex/gpt-6.1-sol, Medium.
- Pi session: 01a124a7-742a-7407-98dd-6e06652465de.
- Native session file: /Users/des/.pi/agent/sessions/--Users-des-dev-dci-harness--/2026-10-10T07-11-56-458Z_01a124a7-742a-7407-98dd-6e06652465de.jsonl.
- Live status read: running, active autonomous turn started 2026-10-10T15:30:51.326Z, snapshot updated 15:31:01.294Z. Last owner message 15:30:02.357Z; error attention timestamp 15:29:01.545Z. This does not prove whether the earlier prompt ack arrived or the process survived that exact event.

## Correlated evidence

- Daemon PID 19792 refreshed this agent from persistence at 15:26:28.223Z. Native previous assistant was aborted at 15:26:28.248Z. These timestamps match the reload, not evidence of a sampler failure.
- First turn b5eeb91e-939f-4169-95d3-f4cb4b5be284 failed at 15:27:39.439Z: prompt RPC 60333 ms / 60000 ms. Subtracting elapsed places request start at about 15:26:39.106Z.
- Second turn 788e96a7-a0bd-4be1-adcf-caeee198a785 failed at 15:29:01.545Z: 60074 ms / 60000 ms; start about 15:28:01.471Z.
- Native session has no new user or assistant entry between reload and 15:30:00.890Z. At that time it records compaction ea8fe8db, tokensBefore 300380, fromHook false. Postcompact instructions/relock/todo bookkeeping finish by 15:30:01.394Z; first new user entry follows at 15:30:01.398Z. Later tool/model activity is AFTER the timeout windows, not evidence of activity during them.
- Paseo cli-runtime.ts:159-176 sends prompt via JsonlRpcProcess.startRequest and awaits its matched response. jsonl-rpc-process.ts:142-169 starts the timer before stdin send, deletes the pending request on timeout and appends its stderr buffer to the error. Dependency warnings are appended diagnostics, not causal classification.
- On child exit, jsonl-rpc-process.ts:115-124 fails pending requests with `process exited with code ... and signal ...`, not this phase=prompt timeout. No agent-specific process-exit event found in the correlated daemon interval. Historical child PID/response IDs are not logged at the current level; current ps argv matching cannot establish historical process survival.
- Installed Pi 1.0.4-df rpc-mode.js:298-317 responds only when session.prompt's preflightResult callback fires. agent-session.js:1513-1627 may await deferred settlement, input handlers, auth, \_checkCompaction at 1582, before-agent-start hooks at 1587 and image normalization before preflightResult("started") at 1626. The actual agent loop starts afterward.

## Finding and limit

Confirmed failure: Paseo's prompt acknowledgement deadline expired; it is not a model-generation deadline. The native session timing and Pi acknowledgement placement strongly identify long preflight/compaction settlement as the blocking phase: compaction finishes roughly 202 seconds after the first request began, followed immediately by the first user entry. Do not label the static extension warnings, external MCP adapter or DGX as the cause.

Exact time spent in each Pi preflight await, and whether an acknowledgement was eventually emitted with the original request id, cannot be recovered from current info logs alone. A lost/misidentified response is not fully excluded. Pi-side need: inspect/correlate preflight compaction/deferred-settlement and callback timing for this session; no restart, new inference or changes are authorized by this trace.

## Upstream versus fork provenance

Checked against upstream tag v0.11.1 and git blame/history. Installed packaged Pi agent.js also matches the checkout's compiled Pi agent byte-for-byte.

| Behaviour                                                   | Source and provenance                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 60000 ms Pi RPC default, including prompt ACK               | agent.ts:107,113; upstream 463415ae846cbcfef0df691e413a1a73a9213757, `fix(providers): tolerate slow Pi and OMP RPC startup (#4008)`. Present unchanged in v0.11.1. Despite the startup title, it supplies the runtime's default request deadline.                      |
| Manual compact RPC has NO wall-clock timeout                | cli-runtime.ts:193-197,298-302; semantic introduction b4518cbf3352210cefec1715c00ad000c4abd20f, `remove wall-clock timeout for Pi compact RPC (#2181)`; current blame lands on upstream licensing commit a8734a972495cf343f628d1017e87775767aade5. Present in v0.11.1. |
| Hold startTurn while our manual compact RPC is pending      | OUR 2419f0e5b921f6788df75bb4199b5962c2e65dce; carried by 09bde0ff7aaab5720a3f7e2fc8cc4e7c8825c6e0. des/overlays/pi-compaction-hold.patch. Absent from v0.11.1; overlay contains no 60-second setting.                                                                  |
| Keep turn active through agent_end, finish on agent_settled | Upstream c032df5b3d0ca6eefec02d3ced1012a7c782e720 (#3639) and c424f82922fcd36aa9cc9e473644bca04417b420 (#3849); agent.ts:2272-2282. pendingSettledMessages is completion bookkeeping, not our post-compaction prompt-send gate.                                        |
| Pi ACK-after-preflight and deferred-settled prompt drain    | Pi Fixer independently verifies upstream v1.0.4, installed 1.0.4-df/2dfa1f166; diff of agent-session.ts/rpc-mode.ts against v1.0.4 and working tree is empty. Not our Pi fork changes. Captain evidence: /Users/des/dev/pi/.dci/pi-rpc-timeout.md.                     |

### What our manual gate actually waits for

agent.ts:1805-1809 creates manualCompactionSettled before calling runtimeSession.compact at 1811. Its finally at 1836-1838 resolves the gate on RPC completion or failure and clears it. startTurn:1305-1314 awaits the captured promise, checks that the turn was not cancelled, THEN calls runtimeSession.prompt. JsonlRpcProcess starts the prompt ACK clock only at that latter call; time spent waiting in our gate is not counted in the 60 seconds.

It is not released by a compaction_end UI event. compact uses JSONL_RPC_NO_TIMEOUT, so a 60-second compact deadline does not prematurely release it. Success means Pi's compact RPC returned after session.compact completed. Installed Pi clears its manual compaction controller before emitting compaction_end and returning (agent-session.js:2254-2263,2287-2288).

This gate covers manual compaction initiated through this Paseo session instance. It does not gate automatic compaction inside a subsequently submitted prompt, a fresh session after reload, or Pi's separate \_isEmittingAgentSettled/deferred-action drain. It guarantees no delivery during that successful manual compact RPC; it is not a global Pi-settlement-idle barrier. Failure also releases the gate; the source does not establish every failure as a successful idle settlement.

### Separate upstream Pi queue

Pi Fixer confirms agent-session.ts:1066-1084 keeps \_isEmittingAgentSettled true while awaiting extension agent_settled handlers, emits the native event, clears the flag, then sequentially awaits every deferred action. prompt:1954-1957 enqueues async () => await this.prompt(text, options) without immediately acknowledging it. Each action awaits preflight AND the entire agent prompt; later actions can therefore wait behind an earlier model/tool turn. An RPC prompt sent during that period can be validly deferred yet exceed Paseo's 60-second acknowledgement budget.

### Supported verdict for this receipt

The deadline and Pi deferred/ACK contract are upstream; the manual hold is ours. The receipt proves both prompt calls reached the RPC stage, so any captured manual gate had already released or was absent. It does not prove our gate released too early, nor which Pi preflight/deferred await owned the delay. The late compaction/user entry strongly fits upstream preflight/deferred settlement, but exact response IDs and await timing remain missing. Do not remove the protective manual gate or simply increase the timeout based on this evidence.

Narrow remedy discussion should distinguish (1) accepted/deferred prompt acknowledgement semantics on Pi, preserving preflight failure reporting, from (2) progress-aware prompt handling in Paseo. Establish the failing contract branch first. No remedy implementation is authorized by this provenance request.

## Pending

- Evidence and bounded Pi-side need sent to Pi Fixer d11bb301-7d39-4239-9dd7-c3bc3799faf5; pickup confirmed. It is verifying the installed ACK contract and native compaction timeline read-only. Await its confirmation.
- Durable follow-up bead: paseo-n77. Beads auto-export reported ignored .beads; no force-add or policy change made.
- UAT and children preserved; no mutation to their task/session state has been made. No restarts, new prompts to FP-TESTER, inference or extension changes.
