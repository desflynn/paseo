import { describe, expect, it } from "vitest";
import { createVolumeKeyController } from "./volume-key-controller";

/**
 * Des's final ducking spec, applied straight through to the engine: one down
 * press mutes at once, the next press in either direction resumes, every
 * press synchronous — no window, no timer.
 */
describe("volume key controller", () => {
  it("a single down mutes through the engine immediately", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("down");
    expect(mutes).toEqual([true]);
    expect(controller.isMuted()).toBe(true);
  });

  it("a second down resumes through the engine immediately", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("down");
    controller.handleKey("down");
    expect(mutes).toEqual([true, false]);
    expect(controller.isMuted()).toBe(false);
  });

  it("an up press resumes through the engine immediately", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("down");
    controller.handleKey("up");
    expect(mutes).toEqual([true, false]);
  });

  it("an up press while unmuted reaches no engine call", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("up");
    expect(mutes).toEqual([]);
  });

  it("rapid downs toggle per press: mute, resume, mute", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("down");
    controller.handleKey("down");
    controller.handleKey("down");
    expect(mutes).toEqual([true, false, true]);
    expect(controller.isMuted()).toBe(true);
  });

  it("playback ending unmutes through the engine", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({ setMuted: (muted) => mutes.push(muted) });
    controller.handleKey("down");
    controller.playbackStopped();
    expect(mutes).toEqual([true, false]);
    expect(controller.isMuted()).toBe(false);
  });
});
