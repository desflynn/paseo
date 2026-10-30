# Speak tool: two bugs from 23 Oct 2026

Reported by Des through DGX Head Guy, about 07:15 IST. Read-only dig by Paseo Head Guy. Nothing is fixed yet.
Paths are in `/Users/des/dev/paseo-0.12.0-df/packages` unless they start with `/Users`.

## Bug 1: a long clip plays fine, but the agent gets "Request timed out"

**What happened (daemon log, IST).**

- 06:51:57 call, 647 chars: confirmed after 41.5 s. The agent got `ok`.
- 06:54:09 call, 1508 chars: playback confirmed at 06:55:37, so 88.25 s in total (`TTS generateAndWaitForPlayback done`, `totalMs` 88250).
- 06:55:21 the agent sent a 644-char version, 72 s after the first call. It played in 53.8 s. Des heard the report twice.

**Cause.** The agent runs on Pi, and Pi's MCP client gives up on a tool call after 60 s by default.

- `/Users/des/dev/pi/packages/coding-agent/dist/extensions/mcp/runtime.js:18` has `DEFAULT_TIMEOUT_SECONDS = 60`. Line 160 turns it into `timeoutMs`. Line 299 passes it as `requestTimeoutMs`. `tools.js:203` passes it to `callTool`.
- Error -32001 is the MCP SDK's own request timeout.
- Paseo builds the MCP entry for `paseo` that Pi sees and sets no `timeout` on it (`server/src/server/agent/providers/pi/agent.ts:521-546`, merged at `:598-600`). The injected entry replaces any `paseo` entry in `~/.pi/agent/mcp.json`, so a config-only fix there does not work.
- `speak` blocks until playback ends. Anything over 60 s of synthesis plus playback fails on a Pi seat while still playing. A 4000-char report is about 5 minutes.
- Claude Code seats: probably not affected, because its MCP tool timeout default is far longer. NOT CONFIRMED by test.

**Options.**

- A (recommended). Set `timeout` on the Paseo-injected MCP entry for Pi, for example 660 seconds. That is just above the daemon's 10-minute playback cap (`server/src/server/speech/daemon-speaker.ts`, `DEFAULT_PLAYBACK_TIMEOUT_MS`). One line in `pi/agent.ts` plus a test. It needs a rebuild and an install, on Des's word.
- B. `speak` returns `{ok: true}` as soon as the clip is delivered. Cheaper for agents, but it breaks "blocks until playback completes", so the tool text and the core persona text change too, and two calls then queue on the phone.
- C. Send MCP progress notifications while playing. NOT CONFIRMED that Pi's client resets its timeout on progress, so not recommended.

**Stopgap today.** On a Pi seat, a -32001 from `speak` does not mean the speech failed. Do not re-send. Reports under about 600 characters finish inside 60 s.

## Bug 2: nothing can stop speech once it plays

**What the code does.**

- The protocol has no daemon-to-app "stop audio" message. There is `audio_output` (daemon to app), and `audio_played` and `abort_request` (app to daemon) (`protocol/src/messages.ts:900, 904, 3435`).
- The speak handler passes the MCP cancel signal to the daemon speaker (`server/src/server/agent/tools/paseo-tools.ts`, speak handler). Pi forwards its own abort signal to the call (`tools.js:200-205`). On abort the daemon stops waiting.
- By then the whole clip is already on the phone. The app holds all chunks of the group, then plays them as one blob with no handle to stop it (`app/src/contexts/session-context.tsx:611-651`).
- `abort_request` only cancels the voice session's TTS manager (`server/src/server/session.ts:2630`, `session/voice/voice-session.ts:1107`). The daemon speaker has its own manager and is not touched.
- The app only stops its audio engine from voice mode (`app/src/voice/voice-runtime.ts:549, 798, 913`). The playback queue itself can stop and abort (`app/src/audio/playback.ts`).

**What a fix needs, on both sides.**

1. An additive protocol message, for example `audio_stop {groupId}`, feature-gated per `docs/protocol-compatibility.md`.
2. Daemon: send it to the player client when the speak call is cancelled, and when the agent's run is cancelled.
3. App: on `audio_stop`, stop the engine, drop the group buffer, confirm.

About 2-3 hours with tests, then a rebuild and install.

**Step 3 is app code.** Des's Android phone runs the store build, so it will NOT get it. Only the desktop (our custom build) and our own Android APK (o2.4, o3.4) can.

**Daemon-only partial.** None that stops audio already delivered. Sending the report in shorter groups would let a cancel stop later groups, but it brings back the gaps between them. Not recommended.

**Not read yet.**

- A plugin route: plugins can play audio on every client (upstream `42806cdbf`). Whether a plugin could also stop it, or add a stop button on the store phone app, is NOT CONFIRMED.
- Whether Pi's or Claude's chat "stop" really sends the cancel to the daemon. The daemon log shows no cancel line for the 06:54 call. NOT CONFIRMED.
