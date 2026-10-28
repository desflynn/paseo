import type { AudioPlaybackSource } from "./audio-engine-types";
import type { BufferedAudioChunk } from "./group-playback";

export interface SpeakGroupChunk extends BufferedAudioChunk {
  isLast: boolean;
}

export interface SpeakGroupCallbacks {
  buildSource(chunk: BufferedAudioChunk): AudioPlaybackSource;
  play(source: AudioPlaybackSource): Promise<number>;
  confirm(chunkId: string): Promise<void>;
  onGroupDone(): void;
}

export interface SpeakGroupStream {
  push(chunk: SpeakGroupChunk): void;
  abort(): void;
}

/**
 * Stream one speak group's chunks to the player as they arrive, in chunkIndex
 * order, confirming each chunk to the daemon once it has played. The daemon
 * (tts-manager) counts one confirmation per emitted chunk and only settles the
 * group when every chunk is confirmed after the stream ended — so every arrived
 * chunk is confirmed exactly once, even on playback failure or abort.
 */
export function createSpeakGroupStream(callbacks: SpeakGroupCallbacks): SpeakGroupStream {
  const arrived = new Map<number, BufferedAudioChunk>();
  let nextIndex = 0;
  let lastIndex: number | null = null;
  let pumping = false;
  let dead = false;
  let done = false;

  const confirmQuietly = (chunkId: string) => {
    void callbacks.confirm(chunkId).catch(() => {});
  };

  function finish(): void {
    if (done) return;
    done = true;
    callbacks.onGroupDone();
  }

  /** Stop the group: confirm everything that arrived unplayed, then finish. */
  function abort(): void {
    dead = true;
    for (const chunk of arrived.values()) {
      confirmQuietly(chunk.id);
    }
    arrived.clear();
    finish();
  }

  async function pump(): Promise<void> {
    if (pumping) return;
    pumping = true;
    try {
      while (!dead) {
        const chunk = arrived.get(nextIndex);
        if (!chunk) return;
        arrived.delete(nextIndex);
        nextIndex += 1;
        try {
          await callbacks.play(callbacks.buildSource(chunk));
        } catch {
          confirmQuietly(chunk.id);
          abort();
          return;
        }
        confirmQuietly(chunk.id);
        if (lastIndex !== null && nextIndex > lastIndex) {
          finish();
        }
      }
    } finally {
      pumping = false;
    }
  }

  function push(chunk: SpeakGroupChunk): void {
    if (done) {
      // A late arrival after the group settled: confirm so the daemon's
      // pendingChunks accounting still reaches zero, but never replay.
      confirmQuietly(chunk.id);
      return;
    }
    if (chunk.isLast) {
      lastIndex = chunk.chunkIndex;
    }
    if (chunk.chunkIndex < nextIndex || arrived.has(chunk.chunkIndex)) {
      confirmQuietly(chunk.id);
      return;
    }
    arrived.set(chunk.chunkIndex, chunk);
    void pump();
  }

  return { push, abort };
}
