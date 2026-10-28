/**
 * Wrap 16-bit mono PCM in a WAV container at its own sample rate.
 *
 * Playback runs through a media player, which keeps whatever rate the TTS
 * provider produced (24 kHz today). Only capture needs 16 kHz, because the
 * voice-communication engine's echo reference is 16 kHz; resampling playback to
 * it throws away the top of the band and the audio sounds muffled.
 */
const WAV_HEADER_BYTES = 44;

export function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  // A trailing odd byte cannot be a 16-bit sample; leaving it in would misalign
  // every sample after it.
  const dataLength = pcm.byteLength & ~1;
  const wav = new Uint8Array(WAV_HEADER_BYTES + dataLength);
  const view = new DataView(wav.buffer);

  writeAscii(wav, 0, "RIFF");
  view.setUint32(4, WAV_HEADER_BYTES + dataLength - 8, true);
  writeAscii(wav, 8, "WAVE");

  writeAscii(wav, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate: 16-bit mono
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  writeAscii(wav, 36, "data");
  view.setUint32(40, dataLength, true);
  wav.set(pcm.subarray(0, dataLength), WAV_HEADER_BYTES);

  return wav;
}

function writeAscii(target: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    target[offset + index] = text.charCodeAt(index);
  }
}
