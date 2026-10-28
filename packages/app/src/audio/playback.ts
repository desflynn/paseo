/** One queue for voice and plugin audio, including cancellation while loading. */
import { playbackActiveStore } from "./playback-active-store";

export function createPlaybackQueue<Source>(
  start: (source: Source, signal: AbortSignal) => Promise<number>,
  onIdle: () => void = () => {},
) {
  interface Item {
    source: Source;
    controller: AbortController;
    resolve: (duration: number) => void;
    reject: (error: unknown) => void;
    release: () => void;
  }
  const pending: Item[] = [];
  let active: Item | null = null;
  let destroyed = false;
  // While held, an empty queue does not fire onIdle: a speak group keeps the OS
  // audio session open from its first chunk until its last chunk has played.
  let holdCount = 0;

  async function drain() {
    if (active) return;
    const item = pending.shift();
    if (!item) {
      if (holdCount === 0) {
        playbackActiveStore.setActive(false);
        onIdle();
      }
      return;
    }
    active = item;
    playbackActiveStore.setActive(true);
    try {
      if (item.controller.signal.aborted) throw new Error("Playback stopped");
      item.resolve(await start(item.source, item.controller.signal));
    } catch (error) {
      item.reject(error);
    } finally {
      item.release();
      active = null;
      void drain();
    }
  }

  const stopped = () => new Error("Playback stopped");
  return {
    play(source: Source, signal?: AbortSignal): Promise<number> {
      if (destroyed) return Promise.reject(new Error("Audio engine destroyed"));
      if (signal?.aborted) return Promise.reject(new Error("Playback stopped"));
      return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const cancel = () => {
          controller.abort();
          const index = pending.indexOf(item);
          if (index !== -1) {
            pending.splice(index, 1);
            item.release();
            reject(new Error("Playback stopped"));
          }
        };
        const item: Item = {
          source,
          controller,
          resolve,
          reject,
          release: () => signal?.removeEventListener("abort", cancel),
        };
        signal?.addEventListener("abort", cancel, { once: true });
        pending.push(item);
        void drain();
      });
    },
    stop() {
      active?.controller.abort();
    },
    hold() {
      holdCount += 1;
    },
    releaseHold() {
      holdCount = Math.max(0, holdCount - 1);
      if (holdCount === 0 && !active && pending.length === 0) {
        playbackActiveStore.setActive(false);
        onIdle();
      }
    },
    isHeld: () => holdCount > 0,
    clearQueue() {
      for (const item of pending.splice(0)) {
        item.release();
        item.reject(stopped());
      }
    },
    isPlaying: () => active !== null,
    destroy() {
      destroyed = true;
      this.clearQueue();
      this.stop();
    },
  };
}
