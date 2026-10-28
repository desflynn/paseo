import { Buffer } from "buffer";
import type { AudioPlaybackSource } from "./audio-engine-types";
import { parsePcmSampleRate } from "./pcm";
import { trimLeadingSilence } from "./pcm/trim-leading-silence";

export interface BufferedAudioChunk {
  chunkIndex: number;
  audio: string;
  format: string;
  id: string;
}

export function decodeBase64Chunk(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}

function playbackMimeType(format: string): string {
  if (format === "pcm") return "audio/pcm;rate=24000;bits=16";
  if (format === "mp3") return "audio/mpeg";
  return `audio/${format}`;
}

function sourceFromBytes(bytes: Uint8Array, type: string): AudioPlaybackSource {
  // Copy into a fresh ArrayBuffer: the interface promises ArrayBuffer, and a
  // view over unknown memory may be backed by a SharedArrayBuffer.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    size: copy.byteLength,
    type,
    async arrayBuffer() {
      return copy.buffer;
    },
  };
}

/** Splice the chunks of one audio_output group into a single playback source. */
export function buildAudioPlaybackSource(chunks: BufferedAudioChunk[]): AudioPlaybackSource {
  const decodedChunks = chunks.map((chunk) => decodeBase64Chunk(chunk.audio));
  const totalSize = decodedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of decodedChunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return sourceFromBytes(output, playbackMimeType(chunks[0]?.format ?? "pcm"));
}

/**
 * One chunk as its own playback source. PCM chunks get the daemon lead-in
 * silence capped at 250 ms; encoded formats (mp3, wav) pass through as-is.
 */
export function buildChunkPlaybackSource(chunk: BufferedAudioChunk): AudioPlaybackSource {
  const decoded = decodeBase64Chunk(chunk.audio);
  const kind = chunk.format.split(";")[0].trim();
  if (kind !== "pcm") {
    return sourceFromBytes(decoded, playbackMimeType(chunk.format));
  }
  const sampleRate = parsePcmSampleRate(chunk.format) ?? 24000;
  return sourceFromBytes(
    trimLeadingSilence(decoded, sampleRate),
    `audio/pcm;rate=${sampleRate};bits=16`,
  );
}
