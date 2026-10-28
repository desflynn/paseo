import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Des's routing ruling (28 Oct, via Paseo App Guy): speak plays on the
 * phone-call route — the duplex engine's USAGE_VOICE_COMMUNICATION +
 * CONTENT_TYPE_SPEECH track with MODE_IN_COMMUNICATION and SCO held for the
 * speak group and released after — because the media route is inaudible in
 * his car when the head unit sits on another source. TTS stays 24 kHz and is
 * resampled to the voice channel's 16 kHz with interpolation. Ducking and
 * background playback ride on top unchanged.
 */

const nativeCalls: { name: string; args: unknown[] }[] = [];
const record = (name: string) => {
  const fn = (...args: unknown[]) => {
    nativeCalls.push({ name, args });
    if (name === "initialize") return true;
    if (name === "toggleRecording" || name === "startDictation") return true;
    return undefined;
  };
  return fn;
};
const fakeNative = {
  addExpoTwoWayAudioEventListener: () => ({ remove: () => {} }),
  initialize: record("initialize"),
  releaseAudioSession: record("releaseAudioSession"),
  playPCMData: record("playPCMData"),
  resumePlayback: record("resumePlayback"),
  stopPlayback: record("stopPlayback"),
  setPlaybackMuted: record("setPlaybackMuted"),
  toggleRecording: record("toggleRecording"),
  tearDown: record("tearDown"),
  getMicrophonePermissionsAsync: async () => ({ granted: true }),
  requestMicrophonePermissionsAsync: async () => ({ granted: true }),
};

vi.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: class {
    write() {}
    delete() {}
    get exists() {
      return false;
    }
  },
}));

// Register expo-audio and the file system in vitest's mock registry for the
// engine's static imports; the duplex engine is injected through the engine's
// nativeModule test seam (its runtime require bypasses the registry).
const mediaPlayerCalls: unknown[][] = [];
vi.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => {
    mediaPlayerCalls.push(args);
    throw new Error("the media player must not be used for PCM speak");
  },
  setAudioModeAsync: async () => {},
}));

vi.mock("expo-file-system", () => ({
  Paths: { cache: "/cache" },
  File: class {
    write() {}
    delete() {}
    get exists() {
      return false;
    }
  },
}));

import { createAudioEngine } from "./audio-engine.native";
import type { AudioPlaybackSource } from "./audio-engine-types";

const makeEngine = () =>
  createAudioEngine(
    { onVolumeLevel: () => {}, onCaptureData: () => {} },
    { nativeModule: fakeNative as unknown as typeof import("@getpaseo/expo-two-way-audio") },
  );

const pcmChunk = (samples: number, rate = 24000): Uint8Array => {
  // 1 kHz sine at the given rate: enough spectral content to spot aliasing.
  const out = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i++) {
    const value = Math.round(Math.sin((2 * Math.PI * 1000 * i) / rate) * 20000);
    out[i * 2] = value & 0xff;
    out[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return out;
};

const pcmSource = (bytes: Uint8Array, rate: number): AudioPlaybackSource => ({
  type: `audio/pcm;rate=${rate};bits=16`,
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer as ArrayBuffer,
});

const calls = (name: string) => nativeCalls.filter((c) => c.name === name);

beforeEach(() => {
  nativeCalls.length = 0;
  vi.useFakeTimers();
});

describe("voice-route speak (audio engine)", () => {
  it("standalone PCM speaks on the duplex engine, not the media player", async () => {
    const engine = makeEngine();
    const played = engine.play(pcmSource(pcmChunk(4800), 24000));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls("playPCMData")).toHaveLength(1);
    expect(mediaPlayerCalls).toHaveLength(0);
    // 4800 samples at 24 kHz become 3200 samples at the voice channel's 16 kHz.
    const written = calls("playPCMData")[0].args[0] as Uint8Array;
    expect(written.length).toBe(3200 * 2);
    // The duplex engine was initialized for the speak group.
    expect(calls("initialize")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await played;
  });

  it("the communication route is released once the speak group ends", async () => {
    const engine = makeEngine();
    const played = engine.play(pcmSource(pcmChunk(1600), 24000));
    await vi.advanceTimersByTimeAsync(200);
    await played;
    expect(calls("releaseAudioSession")).toHaveLength(1);
  });

  it("a step-mute reaches the duplex track mid-chunk and the next step unmutes", async () => {
    const engine = makeEngine();
    const played = engine.play(pcmSource(pcmChunk(1600), 24000));
    await vi.advanceTimersByTimeAsync(0);
    engine.setPlaybackMuted(true);
    engine.setPlaybackMuted(false);
    expect(calls("setPlaybackMuted").map((c) => c.args[0])).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(200);
    await played;
  });

  it("a chunk starting while playback is muted passes the mute to the track", async () => {
    const engine = makeEngine();
    engine.setPlaybackMuted(true);
    const played = engine.play(pcmSource(pcmChunk(1600), 24000));
    await vi.advanceTimersByTimeAsync(0);
    expect(
      calls("setPlaybackMuted")
        .map((c) => c.args[0])
        .slice(-1),
    ).toEqual([true]);
    await vi.advanceTimersByTimeAsync(200);
    await played;
  });
});
