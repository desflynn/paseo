/**
 * Volume-step ducking, per Des's final spec (28 Oct, superseding the
 * burst-debounce this file used to carry):
 * - one volume-down press mutes the playing speech AT ONCE
 * - the NEXT volume step in EITHER direction (down or up) resumes playback at
 *   the new system volume — the OS already stepped it; the key observer never
 *   consumes
 * - repeatable mid-utterance, one step per toggle
 * - mute is silent playback, never a pause: this module only tracks state, the
 *   caller mutes/unmutes the player through onMuteChange
 *
 * Pure state logic with no clock: every press takes effect the moment it
 * lands, so tests need no timers and the native wiring needs no timestamps.
 */
export interface VolumeMuteLogic {
  /** A volume-down key press: mutes, or resumes when already muted. */
  down(): void;
  /** A volume-up key press: resumes when muted, otherwise nothing. */
  up(): void;
  isMuted(): boolean;
  /** Speech playback ended: unmute so the next utterance starts clean. */
  playbackStopped(): void;
}

export function createVolumeMuteLogic(options?: {
  onMuteChange?: (muted: boolean) => void;
}): VolumeMuteLogic {
  const onMuteChange = options?.onMuteChange;
  let muted = false;

  const setMuted = (value: boolean) => {
    if (muted === value) return;
    muted = value;
    onMuteChange?.(muted);
  };

  return {
    down(): void {
      setMuted(!muted);
    },
    up(): void {
      setMuted(false);
    },
    isMuted(): boolean {
      return muted;
    },
    playbackStopped(): void {
      setMuted(false);
    },
  };
}
