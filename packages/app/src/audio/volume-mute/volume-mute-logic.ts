/**
 * Volume-key mute with rapid-press debounce, per Des's spec:
 * - a single volume-down press mutes speech playback once the debounce
 *   window has expired with no second press
 * - 2-3 rapid downs inside the window are a volume burst: they step the
 *   system volume and never mute
 * - when the burst settles, a fresh single down mutes again
 * - volume-up unmutes
 * - mute is silent playback, never a pause: this module only tracks state,
 *   the caller mutes/unmutes the player through onMuteChange
 *
 * Pure time-in/state-out logic: the caller supplies timestamps, so tests
 * need no timers and native wiring needs no clock.
 */
export interface VolumeMuteLogic {
  /** A volume-down key press at `now` (ms, monotonic). */
  down(now: number): void;
  /** A volume-up key press at `now` (ms, monotonic). */
  up(now: number): void;
  /** Advance time: settle expired windows and fire the pending mute. */
  tick(now: number): void;
  isMuted(): boolean;
  /** Speech playback ended: drop every pending state and unmute. */
  playbackStopped(): void;
}

export function createVolumeMuteLogic(options: {
  windowMs: number;
  onMuteChange?: (muted: boolean) => void;
}): VolumeMuteLogic {
  const { windowMs, onMuteChange } = options;
  let muted = false;
  // A first down press whose window has not expired yet: it becomes a mute
  // if no second press arrives before the window closes.
  let pendingSince: number | null = null;
  // The last press of a burst that already cancelled its pending mute.
  let burstSince: number | null = null;

  const setMuted = (value: boolean) => {
    if (muted === value) return;
    muted = value;
    onMuteChange?.(muted);
  };

  return {
    down(now: number): void {
      const inPending = pendingSince !== null && now - pendingSince < windowMs;
      const inBurst = burstSince !== null && now - burstSince < windowMs;
      if (inPending) {
        // Second press inside the window: this is a volume burst, not a mute.
        burstSince = now;
        pendingSince = null;
        return;
      }
      if (inBurst) {
        burstSince = now;
        return;
      }
      // Fresh press. While already muted the state never changes, so there
      // is nothing to arm.
      if (!muted) pendingSince = now;
    },
    up(now: number): void {
      // Volume-up only ever unmutes; bursts are unaffected.
      setMuted(false);
      void now;
    },
    tick(now: number): void {
      if (pendingSince !== null && now - pendingSince >= windowMs) {
        pendingSince = null;
        setMuted(true);
      }
      if (burstSince !== null && now - burstSince >= windowMs) {
        burstSince = null;
      }
    },
    isMuted(): boolean {
      return muted;
    },
    playbackStopped(): void {
      pendingSince = null;
      burstSince = null;
      setMuted(false);
    },
  };
}
