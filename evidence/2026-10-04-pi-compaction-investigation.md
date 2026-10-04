# Pi predecessor compaction investigation

Read-only investigation of two dgx-spark-lab predecessor sessions. No deployment or dgx-spark-lab changes. Replacement a9e6de95-7d33-430b-96c0-f4cf5077f69a is excluded.

## Scope and state

- Located both agent registry entries and native session files.
- Inspected saved native session errors, compaction entries, and final usage.
- Completed: correlate available daemon events, inspect installed Pi trigger settings and manual compaction lifecycle, verify prompt admission and error reporting with isolated in-memory runtimes.
- Unresolved: no persisted compaction-start/end telemetry identifies the first unfinished summary attempt's exact start or outcome before Refresh. No provider overflow error proves a headroom failure.
- Owner hypothesis: compaction starts too late near 330k+ of an approximately 356k context window. Not proven.

## First predecessor

Agent: `9e04c074-35a5-4a6c-818b-c44ca2022999`, "3 seat prep work".
Native session: `/Users/des/.pi/agent/sessions/--Users-des-dev-dgx-spark-lab--/2026-10-03T13-29-17-589Z_01a101f4-6a15-72d5-a7b0-c353abbcec26.jsonl`.
Archived: `2026-10-04T09:34:22.641Z`.

Saved compactions:

- `2026-10-03T19:41:02.631Z`: tokensBefore 314021.
- `2026-10-03T23:38:30.080Z`: tokensBefore 341139.
- `2026-10-04T02:24:50.929Z`: tokensBefore 344927.

Last successful assistant usage: `2026-10-04T09:29:41.403Z`, totalTokens 293795 (input 2168, cacheRead 291072, output 555). Last assistant: `2026-10-04T09:33:11.301Z`, stopReason aborted, "Request was aborted". Saved compaction records alone do not classify manual versus automatic.

## Second predecessor

Agent: `88807d4a-93e1-4650-8d65-15079dea0433`, "Sheeit. 3 seat prep work died mid compact. At least he left".
Native session: `/Users/des/.pi/agent/sessions/--Users-des-dev-dgx-spark-lab--/2026-10-04T09-34-21-806Z_01a10643-b06e-7629-9f00-970b421b7f18.jsonl`.
Archived: `2026-10-04T11:51:16.614Z`.

Saved compaction at `2026-10-04T11:40:28.376Z`, tokensBefore 338929, summary length 16076 characters. Session subsequently produced successful assistant/tool work. Last successful assistant at `2026-10-04T11:50:40.658Z`, totalTokens 127951 (input 418, cacheRead 126848, output 685). Final assistant at `2026-10-04T11:50:41.132Z`, stopReason error, "This operation was aborted".

Thus the second session did recover from a saved compaction before its final failure.

## Correlated daemon evidence

First agent, `/Users/des/.paseo/20261004-1103-01-daemon.log`:

- `2026-10-04T09:32:10.496Z`: turn_failed, "Cannot submit a prompt while compaction is in progress. Wait for compaction to finish and retry."
- `2026-10-04T09:32:54.762Z`: same rejection on another foreground turn.
- `2026-10-04T09:33:11.299Z`: client Cancel request. Native aborted assistant follows at `09:33:11.301Z`.
- `2026-10-04T09:34:22.639Z`: client archive request.

Second agent, `/Users/des/.paseo/daemon.log`:

- `2026-10-04T11:50:40.670Z`: client Cancel request.
- `2026-10-04T11:50:41.128Z`: native Read tool result "Operation aborted".
- `2026-10-04T11:50:41.132Z`: native assistant error "This operation was aborted".
- `2026-10-04T11:51:16.613Z`: client archive request.

The second terminal abort correlates with explicit client cancellation, not a model context-overflow error. This does not establish what prompted the owner to cancel it.

## Trigger and summary budget

`/Users/des/.pi/agent/models.json` sets `openai-codex/gpt-6.1-sol` contextWindow to 353400 and maxTokens to 128000. Its modification time precedes both terminal incidents. No compaction override is present in global settings, and no dgx-spark-lab project settings file was found.

Installed Pi 1.0.0 uses `contextTokens > contextWindow - reserveTokens`, with default reserveTokens 16384. Therefore the threshold is strictly above 337016, approximately 95.4% full. The owner-facing 500k warning denominator is separate from this model threshold.

Second saved summary generation usage: input 78778, output 4162, totalTokens 82940. Successful first-agent summary requests used input 112019, 64032, and 74702. Serialized summarisation requests are much smaller than the original context. Near-full conversation context alone does not show that the summary request lacked headroom.

## Verified adapter findings

Source and packaged Paseo adapter both submit a new foreground prompt directly to Pi without waiting for compaction. Pi explicitly rejects prompts while its manual compaction controller is set. This matches the first agent's two logged rejections.

Manual compaction aborts the active run and deliberately does not continue that interrupted turn. A fresh prompt is required after completion. Pi RPC does not provide the interactive terminal's caller-side message queue.

Paseo's compaction_end handler unconditionally emits status completed and does not inspect aborted/errorMessage. Its explicit manual compact command separately emits an assistant error on RPC rejection. A terminal compaction marker alone is not evidence that summarisation succeeded.

## Isolated verification

Executed a Node/tsx diagnostic against the installed Pi `AgentSession.prompt()` implementation, installed `shouldCompact()`, and Paseo `PiRpcAgentSession` with an in-memory fake runtime. No model requests, live session commands, or deployment changes.

Four assertions passed:

1. At contextWindow 353400 and reserveTokens 16384, 337016 does not trigger; 337017 and observed 338929 do.
2. During manual compaction, Paseo submits the prompt immediately and emits turn_failed with Pi's exact rejection. It does not retain the message for later delivery.
3. After clearing compaction and publishing compaction_end, a fresh prompt reaches the same Pi receiver without rejection. This checks prompt admission, not end-to-end model inference.
4. An automatic compaction_end containing errorMessage is emitted as a completed compaction marker, without an error timeline row.

Read packaged Paseo's adapter directly from `/Applications/Paseo.app/Contents/Resources/app.asar` using `@electron/asar` without extraction. Its startTurn implementation also sends directly to Pi, confirming the queueing defect exists in the installed build, not only the source checkout.

## First recovery sequence

At `2026-10-04T09:32:59.554Z`, the client requests Refresh. `packages/server/src/server/session.ts:4528` handles that by interrupting a running agent and calling reloadAgentSession with rehydrateFromDisk. Native session_start extension metadata appears at `09:33:01.477Z`, followed by a new persisted user message at `09:33:05.746Z`. This is consistent with a replacement runtime admitting the new prompt. The client cancels at `09:33:11.299Z`, and the assistant records Request was aborted two milliseconds later.

No new compaction entry was saved in this sequence. There is no evidence that manual compaction completed successfully before the Refresh interrupted/replaced its runtime. Its exact duration and whether it would have succeeded if left running cannot be established from the available logs.

## Second timing and recovery

Last near-limit assistant before the saved summary: `2026-10-04T11:38:14.692Z`, input plus cacheRead 337420, output 1500, totalTokens 338920. Saved summary at `11:40:28.376Z`, tokensBefore 338929. Those events are 133.684 seconds apart; this is not an exact measured compaction duration because compaction_start was not persisted.

Work continued after compaction with approximately 127k context. The final abort followed client Cancel, not a context-limit exception. Owner perception of an earlier stall may still require additional telemetry; it is not disproved by the successful later compaction.

## Conclusion and limits

The late trigger is explained by Pi's configured model window and default reserve. A missing Paseo queue causes first-session prompt rejection during manual compaction. Refresh and later Cancel interrupt recovery work. Second-session compaction demonstrably succeeds and reduces context before a later explicit client cancellation.

No saved native message or correlated daemon error proves model context exhaustion caused either terminal incident. Earlier compaction might improve the operating margin, but these records do not establish it as the corrective fix. Queueing compaction-time prompts and preserving failed-compaction diagnostics are the concrete adapter defects identified. No fixes or configuration changes were applied.
