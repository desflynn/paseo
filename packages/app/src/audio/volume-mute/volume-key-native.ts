import { Platform } from "react-native";
import { playbackActiveStore } from "../playback-active-store";
import { createVolumeKeyController } from "./volume-key-controller";

/**
 * Android glue: hardware volume-key presses arrive from the
 * paseo-volume-keys native module as "PaseoVolumeKey" events
 * ("down" | "up"). This wires them to the ducking controller, applies the
 * result to the engine, and resets the controller whenever speech playback
 * ends. Non-Android platforms have no native emitter and get a no-op.
 */
export function attachVolumeKeyMute(
  engine: Pick<import("../audio-engine-types").AudioEngine, "setPlaybackMuted">,
  options?: {
    deviceEventEmitter?: typeof import("react-native").DeviceEventEmitter;
  },
) {
  if (Platform.OS !== "android") return () => {};
  // Lazy require keeps the mock injectable and the web bundle free of the import.
  const emitter =
    options?.deviceEventEmitter ??
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react-native").DeviceEventEmitter;
  const controller = createVolumeKeyController({
    setMuted: (muted) => engine.setPlaybackMuted(muted),
  });
  const keySubscription = emitter.addListener("PaseoVolumeKey", (direction: string) => {
    if (direction === "down" || direction === "up") {
      controller.handleKey(direction);
    }
  });
  const unsubscribeActive = playbackActiveStore.subscribe((active) => {
    if (!active) controller.playbackStopped();
  });
  return () => {
    keySubscription.remove();
    unsubscribeActive();
    controller.playbackStopped();
  };
}
