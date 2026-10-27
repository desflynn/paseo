import { expect, test } from "vitest";

import { buildAudioPlaybackSource, type BufferedAudioChunk } from "./group-playback";
import { parsePcmSampleRate, pcm16LeToAudioBuffer } from "./pcm";

const RATE = 24000;

/** The server prepends this to chunk 0 of a grouped pcm clip (tts-manager leadInSilence). */
const LEAD_IN_BYTES = RATE * 2 * 2;

function pcm16FromSamples(samples: number[]): Buffer {
  const out = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => out.writeInt16LE(Math.max(-32768, Math.min(32767, value)), i * 2));
  return out;
}

/** One second of a pure tone, encoded the way the packed Kokoro service emits pcm. */
function toneChunk(freq: number): Buffer {
  const samples: number[] = [];
  for (let i = 0; i < RATE; i += 1)
    samples.push(Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * 12000));
  return pcm16FromSamples(samples);
}

/** Minimal canonical 44-byte WAV writer, the shape an OpenAI-compatible shim returns. */
function wavFromPcm(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function toGroupChunks(payloads: Buffer[], format = "pcm"): BufferedAudioChunk[] {
  return payloads.map((payload, chunkIndex) => ({
    chunkIndex,
    audio: payload.toString("base64"),
    format,
    id: `group:${chunkIndex}`,
  }));
}

/** The decoded stream the web engine hands the platform player for a group source. */
async function decodeLikeWebEngine(
  source: ReturnType<typeof buildAudioPlaybackSource>,
): Promise<Float32Array> {
  const fakeContext = {
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const channel = new Float32Array(length);
      return {
        getChannelData: () => channel,
        duration: length / sampleRate,
        sampleRate,
      };
    },
  };
  const bytes = new Uint8Array(await source.arrayBuffer());
  const buffer = pcm16LeToAudioBuffer(
    fakeContext as unknown as AudioContext,
    bytes,
    parsePcmSampleRate(source.type) ?? RATE,
  );
  return buffer.getChannelData(0);
}

/** Lag-1 autocorrelation per window: speech and tones sit near 0.9+, static near 0. */
function windowAutocorrelation(samples: Float32Array, windowSize: number): number[] {
  const out: number[] = [];
  for (let start = 0; start + windowSize <= samples.length; start += windowSize) {
    let c0 = 0;
    let c1 = 0;
    let mean = 0;
    for (let i = 0; i < windowSize; i += 1) mean += samples[start + i];
    mean /= windowSize;
    for (let i = 1; i < windowSize; i += 1) {
      const d0 = samples[start + i] - mean;
      const d1 = samples[start + i - 1] - mean;
      c0 += d0 * d0;
      c1 += d0 * d1;
    }
    out.push(c0 ? c1 / c0 : 0);
  }
  return out;
}

test("grouped pcm chunks reach the player sample-faithful, with no static window", async () => {
  // Server shape: lead-in silence + 4 sentence segments, base64 per chunk, format "pcm".
  const payloads = [
    Buffer.concat([Buffer.alloc(LEAD_IN_BYTES), toneChunk(440)]),
    toneChunk(550),
    toneChunk(660),
    toneChunk(770),
  ];
  const source = buildAudioPlaybackSource(toGroupChunks(payloads));
  expect(source.type).toBe("audio/pcm;rate=24000;bits=16");

  const channel = await decodeLikeWebEngine(source);
  expect(channel.length).toBe(LEAD_IN_BYTES / 2 + 4 * RATE);

  const windows = windowAutocorrelation(channel, RATE);
  expect(windows).toHaveLength(6); // 2s lead-in + 4 one-second segments
  // Silence (lead-in) has c0 == 0 → 0 by convention; every tone window must be coherent.
  for (const [index, autocorr] of windows.slice(2).entries()) {
    expect(autocorr, `segment ${index} window`).toBeGreaterThan(0.9);
  }
  // Sample-level spot checks: each segment keeps its own frequency.
  for (const [index, freq] of [440, 550, 660, 770].entries()) {
    const start = LEAD_IN_BYTES / 2 + index * RATE;
    expect(channel[start]).toBeCloseTo(Math.sin(0) * (12000 / 32768), 5);
    const at1k = Math.round(Math.sin((2 * Math.PI * freq * 1000) / RATE) * 12000) / 32768;
    expect(channel[start + 1000]).toBeCloseTo(at1k, 4);
  }
});

test("wav-per-chunk bytes in a pcm group corrupt only at headers, never sustained static", async () => {
  // The upstream shape MS Paseo Guy measured: each synthesis answers one complete WAV.
  // If a group of those arrives labelled "pcm", the player reads headers as samples.
  const payloads = [toneChunk(440), toneChunk(550), toneChunk(660)].map((pcm) => wavFromPcm(pcm));
  const channel = await decodeLikeWebEngine(buildAudioPlaybackSource(toGroupChunks(payloads)));

  const windows = windowAutocorrelation(channel, RATE);
  // 44-byte headers = 22 samples: far smaller than one window, so every window stays
  // tone-dominated. Sustained static is impossible from this shape; the artifact is
  // a 22-sample click at each chunk boundary.
  for (const autocorr of windows.slice(1)) {
    expect(autocorr).toBeGreaterThan(0.9);
  }
  expect(windows.length).toBe(3);
});
