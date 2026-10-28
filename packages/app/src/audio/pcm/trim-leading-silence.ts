/**
 * Cap daemon lead-in silence at 250 ms.
 *
 * The daemon prepends silence to the first chunk of a grouped speak (0.4 s today,
 * 2 s on old builds) so a Bluetooth route can settle before the first word. Too
 * much reads as a dead pause. Trimming client-side works against any daemon
 * version. PCM is 16-bit mono little-endian, matching pcm16ToWav.
 */

const DEFAULT_CAP_MS = 250;

export function trimLeadingSilence(
  pcm: Uint8Array,
  sampleRate: number,
  capMs = DEFAULT_CAP_MS,
): Uint8Array {
  const sampleCount = Math.floor(pcm.byteLength / 2);
  const capSamples = Math.round((sampleRate * capMs) / 1000);

  const view = new DataView(pcm.buffer, pcm.byteOffset, sampleCount * 2);
  let silenceSamples = 0;
  while (silenceSamples < sampleCount && view.getInt16(silenceSamples * 2, true) === 0) {
    silenceSamples += 1;
  }
  // Leave at most the cap in place: a shorter lead-in than the cap stays as-is,
  // a longer one is cut down to the cap.
  const trimmedSamples = Math.max(0, silenceSamples - capSamples);

  // A trailing odd byte cannot be a 16-bit sample; dropping it keeps the output
  // sample-aligned the same way pcm16ToWav does.
  return pcm.slice(trimmedSamples * 2, sampleCount * 2);
}
