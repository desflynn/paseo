import { expect, test } from "vitest";

import { trimLeadingSilence } from "./trim-leading-silence";

const RATE = 24000;
const CAP_SAMPLES = Math.round((RATE * 250) / 1000); // 6000 samples = 250 ms

function pcm16FromSamples(samples: number[]): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  samples.forEach((value, i) => view.setInt16(i * 2, value, true));
  return out;
}

const zeros = (count: number): number[] => Array.from({ length: count }, () => 0);

function pcm16ToSamples(pcm: Uint8Array): number[] {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const samples: number[] = [];
  for (let i = 0; i + 1 < pcm.byteLength; i += 2) {
    samples.push(view.getInt16(i, true));
  }
  return samples;
}

test("trims the leading silence down to the cap and keeps the rest sample-faithful", () => {
  const tail = [1, -2, 3, -4, 32767, -32768];
  // More than a cap of leading zeros, the old-daemon shape.
  const pcm = pcm16FromSamples([...zeros(CAP_SAMPLES + 3), ...tail]);

  const trimmed = trimLeadingSilence(pcm, RATE);

  const samples = pcm16ToSamples(trimmed);
  expect(samples).toHaveLength(CAP_SAMPLES + tail.length);
  expect(samples.slice(CAP_SAMPLES)).toEqual(tail);
});

test("a silence run shorter than the cap is left untouched", () => {
  const pcm = pcm16FromSamples([0, 0, 0, 1, 2]);

  expect(pcm16ToSamples(trimLeadingSilence(pcm, RATE))).toEqual([0, 0, 0, 1, 2]);
});

test("caps the trim at 250 ms of silence", () => {
  // 2 s of daemon lead-in silence (the old-build shape) followed by a tone sample.
  const pcm = pcm16FromSamples([
    ...zeros(RATE * 2),
    1234,
    ...Array.from({ length: 100 }, () => 55),
  ]);

  const trimmed = trimLeadingSilence(pcm, RATE);

  const samples = pcm16ToSamples(trimmed);
  expect(samples.length).toBe(CAP_SAMPLES + 101);
  expect(samples[0]).toBe(0);
  expect(samples[CAP_SAMPLES]).toBe(1234);
});

test("all-silence input keeps the 250 ms cap instead of going empty", () => {
  const pcm = pcm16FromSamples(zeros(RATE));

  const trimmed = trimLeadingSilence(pcm, RATE);

  expect(pcm16ToSamples(trimmed)).toHaveLength(CAP_SAMPLES);
});

test("audio with no leading silence is returned unchanged", () => {
  const pcm = pcm16FromSamples([10, 20, 30]);

  expect(trimLeadingSilence(pcm, RATE)).toEqual(pcm);
});

test("empty input stays empty", () => {
  expect(trimLeadingSilence(new Uint8Array(0), RATE)).toHaveLength(0);
});

test("a trailing odd byte is dropped so the output stays sample-aligned", () => {
  const pcm = pcm16FromSamples([0, 7]);
  const withStray = new Uint8Array(pcm.length + 1);
  withStray.set(pcm);
  withStray[pcm.length] = 0xaa;

  const trimmed = trimLeadingSilence(withStray, RATE);

  expect(trimmed.byteLength % 2).toBe(0);
  expect(pcm16ToSamples(trimmed)).toEqual([0, 7]);
});
