/**
 * Reactive "speech playback is happening" flag for the composer UI.
 *
 * The playback queue in playback.ts is imperative; the speak-underway
 * indicator (and anything else that reacts to audio) needs to subscribe.
 * The queue sets this store active when its first item starts and inactive
 * when it goes idle, so a speak group stays active across the held gaps
 * between its chunks.
 */
type PlaybackActiveListener = (active: boolean) => void;

const listeners = new Set<PlaybackActiveListener>();
let active = false;

export const playbackActiveStore = {
  subscribe(listener: PlaybackActiveListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get(): boolean {
    return active;
  },
  /** Called by the playback queue only; UI code subscribes, never sets. */
  setActive(value: boolean): void {
    if (active === value) return;
    active = value;
    for (const listener of listeners) listener(active);
  },
};
