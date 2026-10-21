# Audio inline playback — recon

Goal: markdown link to a local MP3 in an agent reply → inline play button in the semantic-markdown plugin, desktop (Electron web) + phone (Expo native/Hermes). No web server; file lives on the daemon Mac; phone may be remote over relay.

## Q1 — How voice mode TTS works today

**Direction split.** `voice_audio_chunk` (packages/protocol/src/messages.ts:886-892) is _client→server_ mic audio (base64, permission `workspace.write` at packages/server/src/server/authorization/operation-permissions.ts:193). _Server→client_ TTS rides `audio_output` (messages.ts:3389-3400): `{ audio: base64 string, format: string, id, isVoiceMode, groupId?, chunkIndex?, isLastChunk? }`. Playback ack is `audio_played` (messages.ts:912-915).

**Server send.** packages/server/src/server/agent/tts-manager.ts — `synthesizeSegment` (:251-289) gets a stream from a TTS provider (`synthesizeSpeech`, packages/server/src/server/speech/providers/openai/tts.ts:44, local/sherpa/sherpa-tts.ts:99), then buffers the _whole stream_ and emits ONE chunk: `chunkId = \`${audioId}:0\``, `isLastChunk: true`, `fullBuffer.toString("base64")` (tts-manager.ts:394-413). So TTS is one-shot base64 despite the chunk fields.

**App receive + play.** packages/app/src/voice/voice-runtime.ts:677 `handleAudioOutput` (skips unless voice mode on, :679-684) → `decodeAudioChunk` (:273) → `toPlaybackSource` (:277-295, mp3 → `audio/mpeg`) → ordered playback groups → `AudioEngine.play`. Player impls:

- **Native:** packages/app/src/voice/audio-engine.native.ts:66 — `require("@getpaseo/expo-two-way-audio")` (packages/expo-two-way-audio, a custom native module). `playAudio` resamples to 16 kHz **PCM16** and calls `native.playPCMData` — **PCM only; it cannot decode MP3** (`parsePcmSampleRate` fallback 24000 treats mp3 bytes as raw PCM).
- **Web/Electron:** packages/app/src/voice/audio-engine.web.ts:175-178 — Web Audio `AudioContext.decodeAudioData` → `createBufferSource`; **MP3 decodes fine**.

`expo-audio` (~1.0.13, packages/app/package.json:80) is used only for mic recording hooks (packages/app/src/hooks/use-audio-recorder.native.ts:8) — not playback. Not expo-av.

## Q2 — Can a plugin reuse that playback path

**No — the player is app-internal.** `AudioEngine` lives in the app bundle (`@/voice/audio-engine-types`, imported by voice-runtime.ts:5); it is not exported through the plugin SDK.

**What the SDK exposes** (packages/plugin/src/client/react-native.ts): `Icon`, `Modal`, `useToast`, `useRevealedText`, `ScrollView`, `FlatList`, `copyText`, `TextInput`; host.ts adds `callPluginRpc`/providers and `searchPluginAttachments`. No audio, no Image host module.

**Bundle externals allowlist** (des/plugins/semantic-markdown/build.mjs:16-24): `react`, `react/jsx-runtime`, `react-native`, `@tanstack/react-query`, `zod`, `@getpaseo/plugin(/*)`. A plugin **cannot import expo-audio/expo-av today** — not on the allowlist, and native (Hermes) would have no runtime resolver for it. Adding a host audio module is an app+SDK change.

**Per platform without new deps:**

- **Web/Electron:** DOM is reachable — `new Audio(dataUri)` / `blob:` URL works. No app-wide CSP exists; only scoped CSPs for the mermaid iframe (packages/app/src/components/markdown/fence/mermaid/build-runtime.mjs) and html preview (packages/app/src/file-pane/html-preview-csp.ts). `data:`/`blob:` media in the main window is unrestricted.
- **Native/Hermes:** react-native core has **no audio playback**. Without a new host module there is no working player — plugin needs its own path on native via app-side support.

## Q3 — readImage RPC mechanics and size fit for a 5-min MP3

- **Cap:** `MAX_IMAGE_BYTES = 5 * 1024 * 1024` (des/plugins/semantic-markdown/shared/read-image.ts:4).
- **Allowlist:** png/jpg/jpeg/gif/webp only, SVG deliberately out (shared/read-image.ts:6-20). **mp3 is not allowed** — extension check rejects it first.
- **Transport shape:** one-shot `defineRpc` — input `{ path }`, output union `{ ok: true, mime, base64 } | { ok: false, error }` (shared/read-image.ts:23-33). Server: `stat` size check, whole-file `readFile` → base64 (des/plugins/semantic-markdown/server/read-image.ts:12-24). Registered `server.handle(readImageRpc, readImage)` (des/plugins/semantic-markdown/index.server.ts:6). Client builds `data:${mime};base64,…` (des/plugins/semantic-markdown/client/vendor/components/markdown/renderer.tsx:377) via `useRpc(readImageRpc)` (:398).
- **Size limits on the wire:** the daemon's WS server sets **no `maxPayload`** (packages/server/src/server/websocket-server.ts:827-837) → ws library default ≈100 MiB. Relay frame cap **32 MiB wire** (`RELAY_MAX_FRAME_BYTES`, packages/server/src/utils/checkout-git.ts:2120), and E2EE adds base64+40 B overhead, so ≈**24 MiB plaintext per frame** (packages/relay/src/encrypted-channel.ts:122-131).
- **Verdict:** a 5-min MP3 ≈5 MB → ≈6.7 MB base64 — **fits one-shot on both direct WS and relay**. The 5 MiB cap is plugin policy, not transport. No chunking or range reads needed at this size; a ~16 MiB audio cap keeps ~40% headroom under the relay frame budget.

## Q4 — Recommended smallest design

**RPC: one shot.** New `read-audio` beside read-image: input `{ path }`, output `{ ok: true, mime: "audio/mpeg", base64, sizeBytes } | { ok: false, error }`. Own allowlist (mp3, m4a, wav, ogg) and cap **16 MiB** — one frame fits relay (~24 MiB plaintext) and direct WS with room. Reuse read-image's union shape and `localFilePath` guard. No chunking until a real file misses the cap.

**Player:**

- **Desktop (Electron web):** plugin-local `HTMLAudioElement` fed a **`blob:` URL** (`URL.createObjectURL` from the decoded bytes, `revokeObjectURL` on unmount) — avoids a second 6.7 MB string copy and any CSP question. `data:` works too but doubles memory.
- **Phone (Hermes):** no way around a **new host module** — smallest change is exposing expo-audio (already an app dependency, packages/app/package.json:80) through `@getpaseo/plugin/client/react-native` as `createAudioPlayer(source): { play, pause, seek, duration, position }`, added to HOST_MODULES (build.mjs:16-24) and the app's runtime resolver. Reusing voice-mode's `expo-two-way-audio` is wrong — it is PCM16-only and cannot decode MP3 (Q1).

**UX:** link renders as a compact inline pill: play/pause button + progress line + duration; tap toggles, second tap on the label opens nothing remote (file is daemon-side) — desktop could offer "reveal in Finder" via a future RPC. Fetch once per (path, mtime), cache the decoded bytes in the component.

**Traps:**

- **Memory:** 5 MB file → 6.7 MB base64 string → decoded bytes; on Hermes that is ~3 copies transiently. Cache one decode, drop the base64 string immediately.
- **Streaming re-renders:** the markdown link re-renders mid-stream; memoize the RPC result by URI so audio is not refetched/recreated every keystroke.
- **Relay latency:** 6.7 MB one-shot is seconds on mobile data — fetch lazily on first tap, not on render; show a fetching state on the pill.
- **Autoplay:** web autoplay policies require a user gesture — the play button _is_ the gesture, so `play()` from the tap handler is safe. Do not autoplay on render.
- **Electron CSP:** none today for the main window (only scoped mermaid/html-preview CSPs) — keep it that way; a future strict CSP would need `media-src blob: data:`.
- **Hermes interop:** the new host module must survive the globalThis lowered-bundle interop (client/main.lowered.js:43801 pattern); test on-device, not just Hermes harness.
