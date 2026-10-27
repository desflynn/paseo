/**
 * An OpenAI-compatible TTS shim can ignore response_format=pcm and answer with a
 * complete WAV. Segments of a pcm-labelled clip would then carry each 44-byte header
 * as in-band samples — a click per sentence, and garbage if the shim ever grows its
 * header. Detect the RIFF header and hand back the raw PCM payload, adding the
 * sample rate to the format label when the shim's answer was WAV.
 */
export function pcmSegmentBytes(buffer: Buffer, format: string): { bytes: Buffer; format: string } {
  if (!format.startsWith("pcm")) return { bytes: buffer, format };
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return { bytes: buffer, format };
  }
  try {
    const { sampleRate, pcm16 } = parsePcm16MonoWav(buffer);
    const [kind, ...params] = format.split(";").map((part) => part.trim());
    const nextFormat = params.some((part) => part.startsWith("rate="))
      ? format
      : `${kind};rate=${sampleRate}`;
    return { bytes: pcm16, format: nextFormat };
  } catch {
    // Not a WAV we understand (stereo, 8-bit, extended): play the bytes as labelled
    // rather than dropping a segment.
    return { bytes: buffer, format };
  }
}

export function parsePcm16MonoWav(buffer: Buffer): { sampleRate: number; pcm16: Buffer } {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV header");
  }

  let offset = 12;
  let fmt: {
    audioFormat: number;
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
  } | null = null;
  let dataChunk: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + size;
    if (payloadEnd > buffer.length) {
      break;
    }

    if (id === "fmt ") {
      const audioFormat = buffer.readUInt16LE(payloadStart);
      const channels = buffer.readUInt16LE(payloadStart + 2);
      const sampleRate = buffer.readUInt32LE(payloadStart + 4);
      const bitsPerSample = buffer.readUInt16LE(payloadStart + 14);
      fmt = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (id === "data") {
      dataChunk = buffer.subarray(payloadStart, payloadEnd);
    }

    offset = payloadEnd + (size % 2);
  }

  if (!fmt || !dataChunk) {
    throw new Error("Missing WAV fmt/data chunks");
  }
  if (fmt.audioFormat !== 1) {
    throw new Error(`Unsupported WAV encoding (audioFormat=${fmt.audioFormat})`);
  }
  if (fmt.channels !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(
      `Unexpected WAV format: channels=${fmt.channels} rate=${fmt.sampleRate} bits=${fmt.bitsPerSample}`,
    );
  }
  if (dataChunk.length % 2 !== 0) {
    throw new Error("WAV PCM16 data length must be even");
  }
  return { sampleRate: fmt.sampleRate, pcm16: dataChunk };
}

export function parsePcmRateFromFormat(
  format: string,
  fallback: number | null = null,
): number | null {
  const match = /(?:^|[;,\s])rate\s*=\s*(\d+)(?:$|[;,\s])/i.exec(format);
  if (!match) {
    return fallback;
  }
  const rate = Number.parseInt(match[1], 10);
  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
}

export function pcm16lePeakAbs(pcm16le: Buffer): number {
  if (pcm16le.length === 0) {
    return 0;
  }
  if (pcm16le.length % 2 !== 0) {
    throw new Error(`PCM16 chunk byteLength must be even, got ${pcm16le.length}`);
  }
  const samples = new Int16Array(pcm16le.buffer, pcm16le.byteOffset, pcm16le.byteLength / 2);
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i];
    const abs = v < 0 ? -v : v;
    if (abs > peak) {
      peak = abs;
      if (peak >= 32767) {
        break;
      }
    }
  }
  return peak;
}

export function pcm16leToFloat32(pcm16le: Buffer, gain: number = 1): Float32Array {
  if (pcm16le.length % 2 !== 0) {
    throw new Error(`PCM16 chunk byteLength must be even, got ${pcm16le.length}`);
  }
  const int16 = new Int16Array(pcm16le.buffer, pcm16le.byteOffset, pcm16le.byteLength / 2);
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    const v = (int16[i] / 32768.0) * gain;
    out[i] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

export function float32ToPcm16le(samples: Float32Array): Buffer {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    out[i] = Math.round(clamped * 32767);
  }
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength);
}

export function chunkBuffer(buffer: Buffer, chunkBytes: number): Buffer[] {
  if (chunkBytes <= 0) {
    return [buffer];
  }
  const out: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    out.push(buffer.subarray(offset, Math.min(buffer.length, offset + chunkBytes)));
  }
  return out;
}
