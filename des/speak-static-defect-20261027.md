# Speak static — defect report, 2026-10-27

**Symptom.** Daemon-speaker output (the `speak` tool) plays the first sentence cleanly,
then static for the rest of the clip. Upstream had been cleared with clean WAVs from the
Kokoro chain.

**Repro facts, recovered from `~/.paseo/20261027-0056-01-daemon.log`** (speak tool call at
`1793061343622`, agent `483243e5`, text 662 chars):

- TTS provider: OpenAI-compatible, base URL `http://dgx-spark:18332/v1` (speed proxy to the
  packed Kokoro service). Model `kokoro`, voice `af_aoede`, server default
  `response_format: "pcm"`.
- The text split into 6 sentence segments (55/203/103/107/129/60 chars). All 6 synthesized
  without error (13.5 s cold, 4.7 s, then about 280 ms warm each).
- 6 `audio_output` chunks went to one app client (2 connected). The client confirmed all 6
  chunk ids at the same millisecond, 30.4 s after the last chunk — one clip.

## Where the audio travels

1. `packages/server/src/server/agent/tts-manager.ts` splits the text into sentences of at
   most 260 chars. Each sentence is a separate synthesis request; two run concurrently.
   With `singleClip`, every segment becomes a chunk of one group. Chunk 0 gets a 2 s
   lead-in silence. Each chunk carries the label `pcm`.
2. The speed proxy (`kokoro-proxy-311a1-beta`, port 18332) relays upstream bytes verbatim.
3. The packed service (`build/serve/app_serve.py`) answers `pcm` with clean raw PCM16 LE
   mono 24 kHz and no header. It answers `wav` with a canonical 44-byte WAV.
4. `packages/app/src/contexts/session-context.tsx` buffers all group chunks, sorts them by
   chunkIndex, and `buildAudioPlaybackSource` concatenates them into one blob labelled with
   chunk 0's format. The web engine decodes the whole buffer as PCM 24k. The native engine
   resamples to 16k and feeds the two-way audio module in one call.

## What was proven (tests now in the repo)

- **The client splice is sample-faithful.** The real `buildAudioPlaybackSource` and the
  real web-engine decode math, driven with clean-PCM chunks of distinct tones, deliver
  every sample to the player boundary intact. See
  [speak-group-static.test.ts](/Users/des/dev/personal/src/paseo/packages/app/src/audio/speak-group-static.test.ts).
- **Sustained static cannot come from any byte shape the current chain emits.** The worst
  shape is a shim that answers every segment with a complete WAV while the group says
  `pcm`. That puts a 44-byte (22-sample) click at each sentence boundary — not sustained
  noise. Same test file proves it.
- **The packed service honours `pcm`** (code read of `build/serve/app_serve.py`), and the
  speed proxy is a byte pipe (code read of `build/proxy/app.py`).

## The named defect and its boundary

The static bytes entered the segment streams upstream of the client splice, at repro time.
Every Paseo path is byte-faithful for what today's chain emits. The repro ran against the
beta chain (`kokoro-311a1-beta` and `kokoro-proxy-311a1-beta`). Both containers have since
been rebuilt and crashed (`Exited (255)`). The whole TTS stack was down during this
investigation: port 18332 closed, and the evidence WAVs in /tmp were lost to the reboot.
The exact corrupt bytes are gone.

One gap in the upstream clearing matters: it tested one whole-text request, sequentially.
The server never drives that pattern. It drives several short requests, two at a time, on
a reused connection, against a warm GPU pipeline. That pattern was never tested.

## Fixed while here (small, in-brief, TDD)

The one real boundary defect the brief predicted — a pcm-labelled segment carrying WAV
bytes, so the header plays as samples:

- `packages/server/src/server/speech/audio.ts`: new `pcmSegmentBytes(buffer, format)`. For
  pcm-labelled segments it detects RIFF/WAVE, strips the header with `parsePcm16MonoWav`,
  and carries the WAV's sample rate into the format label. WAVs it cannot parse pass
  through untouched.
- `packages/server/src/server/agent/tts-manager.ts`: both emit paths normalize before
  emission. The grouped lead-in silence now uses the normalized format.
- Tests: [tts-manager.test.ts](/Users/des/dev/personal/src/paseo/packages/server/src/server/agent/tts-manager.test.ts)
  (WAV-shim strip, rate carry, passthrough) — 11/11 green.
  [speak-group-static.test.ts](/Users/des/dev/personal/src/paseo/packages/app/src/audio/speak-group-static.test.ts)
  — 2/2 green. Typecheck, lint and format clean. Nothing committed.

## Live verification (blocked, not forgotten)

The TTS chain was down during this investigation. I did not restart Des's voice infra.

1. `docker start kokoro-311a1-beta kokoro-proxy-311a1-beta`.
2. Re-run the daemon-speaker repro with a 6-sentence text.
3. If static recurs, probe concurrency and keep-alive next: fire the exact server pattern
   (two concurrent short `pcm` requests on a reused connection) at port 18332 and hash each
   response. A cheap permanent wire-tap: log each chunk's byte length and first 4 bytes in
   `emitGroupedSegment`.
