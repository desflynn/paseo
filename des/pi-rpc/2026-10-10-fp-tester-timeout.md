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

## Pending

- Evidence and bounded Pi-side need sent to Pi Fixer d11bb301-7d39-4239-9dd7-c3bc3799faf5; pickup confirmed. It is verifying the installed ACK contract and native compaction timeline read-only. Await its confirmation.
- Durable follow-up bead: paseo-n77. Beads auto-export reported ignored .beads; no force-add or policy change made.
- UAT and children preserved; no mutation to their task/session state has been made. No restarts, new prompts to FP-TESTER, inference or extension changes.
