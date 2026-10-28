import { createVolumeMuteLogic } from "./volume-mute-logic";

/**
 * Feeds hardware volume-key presses into the mute logic and applies the
 * result to the engine. The settle timer is armed on every down press: when
 * it fires, a lone press becomes a mute and a finished burst settles, so a
 * fresh single press afterwards re-arms the muting rule.
 *
 * Key events arrive from the native module through the wiring in
 * volume-key-native.ts; tests call handleKey directly with fake timers.
 */
export function createVolumeKeyController(options: {
  windowMs: number;
  setMuted: (muted: boolean) => void;
}) {
  const { windowMs, setMuted } = options;
  const logic = createVolumeMuteLogic({ windowMs, onMuteChange: setMuted });
  let timer: ReturnType<typeof setTimeout> | undefined;

  const settle = () => {
    timer = undefined;
    logic.tick(Date.now());
  };

  return {
    handleKey(direction: "down" | "up"): void {
      if (direction === "down") {
        logic.down(Date.now());
        // Re-arm on every press: the window measures from the LAST down, so
        // a burst keeps extending and only its final press's window decides.
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(settle, windowMs);
        return;
      }
      logic.up(Date.now());
    },
    isMuted(): boolean {
      return logic.isMuted();
    },
    playbackStopped(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      logic.playbackStopped();
    },
  };
}
