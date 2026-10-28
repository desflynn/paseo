import { expect, test } from "vitest";
import { createPlayAudio } from "./play-audio";
import { playPcm16, parsePcmSampleRate, resampleToPcm16 } from "./pcm";
import { playFile, type FilePlaybackStatus, type FilePlayer } from "./file-playback";

const source = { base64: "UklGRg==", mimeType: "audio/wav" };
test("passes RPC file bytes to the shared engine and awaits completion", async () => {
  const owner = new AbortController();
  let finish!: () => void;
  const played = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let completed = false;
  const play = createPlayAudio(
    {
      async play(audio, signal) {
        expect(signal).toBe(owner.signal);
        expect(audio.type).toBe("audio/wav");
        expect(audio.size).toBe(4);
        expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
        await played;
        return 1;
      },
    },
    owner.signal,
  );
  const result = play(source).then(() => {
    completed = true;
    return undefined;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  finish();
  await result;
  expect(completed).toBe(true);
});

test.each([
  { ...source, base64: "garbage!" },
  { ...source, base64: "" },
  { ...source, mimeType: "text/plain" },
])("rejects invalid input before reaching a decoder: %o", async (input) => {
  const play = createPlayAudio(
    {
      play() {
        throw new Error("Reached decoder");
      },
    },
    new AbortController().signal,
  );
  await expect(play(input)).rejects.toThrow(/^Audio must/);
});

test("rejects calls from an unloaded plugin", async () => {
  const owner = new AbortController();
  owner.abort(new Error("Plugin unloaded"));
  const play = createPlayAudio(
    {
      play() {
        throw new Error("Reached decoder");
      },
    },
    owner.signal,
  );
  await expect(play(source)).rejects.toThrow("Playback stopped");
});

test("voice PCM retains its native output and 16 kHz samples", async () => {
  const pcm = new Uint8Array([0, 0, 255, 127, 0, 128]);
  let written: Uint8Array | undefined;
  const duration = await playPcm16(
    pcm,
    "audio/pcm;rate=16000;bits=16",
    new AbortController().signal,
    {
      resumePlayback() {},
      playPCMData(bytes) {
        written = bytes;
      },
      stopPlayback() {},
    },
  );
  expect(written).toEqual(pcm);
  expect(duration).toBe(3 / 16000);
});

test("24 kHz voice PCM resamples to 16 kHz with interpolation, not decimation", async () => {
  // 0.25 s of a 440 Hz sine at half-scale: interpolation must keep the tone
  // (zero crossings ~220) and its amplitude; naive decimation would alias both.
  const inputRate = 24000;
  const samples = inputRate / 4;
  const pcm = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / inputRate) * 16000);
    pcm[i * 2] = value & 0xff;
    pcm[i * 2 + 1] = (value >> 8) & 0xff;
  }
  let written: Uint8Array | undefined;
  await playPcm16(pcm, "audio/pcm;rate=24000;bits=16", new AbortController().signal, {
    resumePlayback() {},
    playPCMData(bytes) {
      written = bytes;
    },
    stopPlayback() {},
  });
  expect(written).toBeDefined();
  const out = written!;
  expect(out.length).toBe(4000 * 2); // 0.25 s at the voice channel's 16 kHz
  const amplitudes: number[] = [];
  let crossings = 0;
  let previous = 0;
  for (let i = 0; i < out.length / 2; i++) {
    const value = (out[i * 2 + 1] << 8) | out[i * 2];
    const signed = value & 0x8000 ? value - 0x10000 : value;
    if ((previous < 0 && signed >= 0) || (previous > 0 && signed <= 0)) crossings += 1;
    previous = signed;
    amplitudes.push(Math.abs(signed));
  }
  expect(Math.abs(crossings - 220)).toBeLessThanOrEqual(4); // tone preserved
  const peak = Math.max(...amplitudes);
  expect(peak).toBeGreaterThan(15000); // amplitude preserved within ~6%
  expect(peak).toBeLessThanOrEqual(16000);
});

test("voice PCM cancellation stops native output and rejects", async () => {
  let stopped = false;
  const owner = new AbortController();
  const result = playPcm16(new Uint8Array(32000), "audio/pcm;rate=16000;bits=16", owner.signal, {
    resumePlayback() {},
    playPCMData() {},
    stopPlayback() {
      stopped = true;
    },
  });
  owner.abort();
  await expect(result).rejects.toThrow("Playback stopped");
  expect(stopped).toBe(true);
});

function filePlayer() {
  let listener: (status: FilePlaybackStatus) => void = () => {};
  let removed = false;
  let started = false;
  const player: FilePlayer = {
    play() {
      started = true;
    },
    remove() {
      removed = true;
    },
    addListener(_event, callback) {
      listener = callback;
      return {
        remove() {
          listener = () => {};
        },
      };
    },
  };
  return {
    player,
    status: (status: Partial<FilePlaybackStatus>) =>
      listener({
        playbackState: "ready",
        duration: 1,
        didJustFinish: false,
        isLoaded: true,
        ...status,
      }),
    removed: () => removed,
    started: () => started,
  };
}

test("native file playback waits for completion and releases its player", async () => {
  const h = filePlayer();
  const promise = playFile(h.player, new AbortController().signal);
  expect(h.started()).toBe(true);
  h.status({ didJustFinish: true });
  await expect(promise).resolves.toBe(1);
  expect(h.removed()).toBe(true);
});

test("native decoder errors reject and release the player", async () => {
  const h = filePlayer();
  const promise = playFile(h.player, new AbortController().signal);
  h.status({ playbackState: "failed" });
  await expect(promise).rejects.toThrow("could not be decoded");
  expect(h.removed()).toBe(true);
});

test("native cancellation releases playback and settles the caller", async () => {
  const h = filePlayer();
  const owner = new AbortController();
  const promise = playFile(h.player, owner.signal);
  owner.abort(new Error("Plugin unloaded"));
  await expect(promise).rejects.toThrow("Playback stopped");
  expect(h.removed()).toBe(true);
});

test.each(["audio/pcm;rate=16000;bits=16", "AUDIO/PCM; rate=16000"])(
  "rejects raw PCM instead of initializing voice capture: %s",
  async (mimeType) => {
    const play = createPlayAudio(
      {
        play: async () => {
          throw new Error("Reached engine");
        },
      },
      new AbortController().signal,
    );
    await expect(play({ base64: "AAAAAA==", mimeType })).rejects.toThrow(
      "Pass an audio file, such as WAV or MP3",
    );
  },
);

// Voice capture and browser dictation use this same PCM boundary.
test("capture PCM preserves clipping, signed samples, and empty input", () => {
  expect(resampleToPcm16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]), 16000, 16000)).toEqual(
    new Int16Array([-32768, -32768, -16384, 0, 16384, 32767, 32767]),
  );
  expect(resampleToPcm16(new Float32Array(), 48000, 16000)).toEqual(new Int16Array());
});

test("capture PCM resamples with interpolation and preserves the last sample", () => {
  expect(resampleToPcm16(new Float32Array([-1, 0, 1]), 24000, 16000)).toEqual(
    new Int16Array([-32768, 16384]),
  );
  expect(resampleToPcm16(new Float32Array([0, 1]), 8000, 16000)).toEqual(
    new Int16Array([0, 16384, 32767, 32767]),
  );
});

test("voice playback shares PCM sample-rate parsing", () => {
  expect(parsePcmSampleRate("audio/pcm;rate=16000;bits=16")).toBe(16000);
  expect(parsePcmSampleRate("audio/PCM;RATE=48000")).toBe(48000);
  expect(parsePcmSampleRate("audio/pcm")).toBeNull();
  expect(parsePcmSampleRate("audio/pcm;rate=0")).toBeNull();
});
