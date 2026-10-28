import { createVolumeMuteLogic } from "./volume-mute-logic";

/**
 * Feeds hardware volume-key presses into the ducking logic and applies the
 * result to the engine. Every press takes effect immediately — there is no
 * window and no timer, so a down press mutes on the spot and the next press
 * in either direction resumes at the stepped system volume.
 *
 * Key events arrive from the native module through the wiring in
 * volume-key-native.ts; tests call handleKey directly.
 */
export function createVolumeKeyController(options: { setMuted: (muted: boolean) => void }) {
  const logic = createVolumeMuteLogic({ onMuteChange: options.setMuted });

  return {
    handleKey(direction: "down" | "up"): void {
      if (direction === "down") {
        logic.down();
        return;
      }
      logic.up();
    },
    isMuted(): boolean {
      return logic.isMuted();
    },
    playbackStopped(): void {
      logic.playbackStopped();
    },
  };
}
