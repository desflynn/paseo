import { describe, expect, test } from "vitest";
import { pcm16ToWav } from "./wav";

/** Read a little-endian uint32 from the header. */
function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

describe("pcm16ToWav", () => {
  test("keeps the source sample rate instead of resampling it down", () => {
    // One second of 24 kHz 16-bit mono. A resample to 16 kHz would yield 32000 bytes.
    const pcm = new Uint8Array(24_000 * 2);
    const wav = pcm16ToWav(pcm, 24_000);

    expect(u32(wav, 24)).toBe(24_000);
    expect(wav.byteLength).toBe(pcm.byteLength + 44);
    expect(u32(wav, 40)).toBe(pcm.byteLength);
  });

  test("writes a mono 16-bit PCM WAV header", () => {
    const wav = pcm16ToWav(new Uint8Array(8), 24_000);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(u32(wav, 4)).toBe(wav.byteLength - 8);
    expect(u16(wav, 20)).toBe(1); // PCM
    expect(u16(wav, 22)).toBe(1); // mono
    expect(u32(wav, 28)).toBe(24_000 * 2); // byte rate
    expect(u16(wav, 32)).toBe(2); // block align
    expect(u16(wav, 34)).toBe(16); // bits per sample
  });

  test("copies the samples through byte for byte", () => {
    const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const wav = pcm16ToWav(pcm, 16_000);

    expect(Array.from(wav.subarray(44))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("drops a trailing odd byte so the data chunk stays sample-aligned", () => {
    const wav = pcm16ToWav(new Uint8Array([1, 2, 3, 4, 5]), 24_000);

    expect(u32(wav, 40)).toBe(4);
    expect(wav.byteLength).toBe(48);
  });
});
