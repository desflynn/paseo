import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVolumeKeyController } from "./volume-key-controller";

describe("volume key controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a single down mutes through the engine once the window expires", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({
      windowMs: 300,
      setMuted: (muted) => mutes.push(muted),
    });
    controller.handleKey("down");
    expect(mutes).toEqual([]); // window still open: nothing muted yet
    vi.advanceTimersByTime(301);
    expect(mutes).toEqual([true]);
    expect(controller.isMuted()).toBe(true);
  });

  it("rapid downs never reach the engine as a mute", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({
      windowMs: 300,
      setMuted: (muted) => mutes.push(muted),
    });
    controller.handleKey("down");
    vi.advanceTimersByTime(150);
    controller.handleKey("down");
    vi.advanceTimersByTime(150);
    controller.handleKey("down");
    vi.advanceTimersByTime(5000);
    expect(mutes).toEqual([]);
    expect(controller.isMuted()).toBe(false);
  });

  it("an up press unmutes through the engine immediately", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({
      windowMs: 300,
      setMuted: (muted) => mutes.push(muted),
    });
    controller.handleKey("down");
    vi.advanceTimersByTime(301);
    controller.handleKey("up");
    expect(mutes).toEqual([true, false]);
  });

  it("playback ending drops a pending press and cancels its timer", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({
      windowMs: 300,
      setMuted: (muted) => mutes.push(muted),
    });
    controller.handleKey("down");
    controller.playbackStopped();
    vi.advanceTimersByTime(5000);
    expect(mutes).toEqual([]);
    expect(controller.isMuted()).toBe(false);
  });

  it("after a burst settles a fresh single down mutes again", () => {
    const mutes: boolean[] = [];
    const controller = createVolumeKeyController({
      windowMs: 300,
      setMuted: (muted) => mutes.push(muted),
    });
    controller.handleKey("down");
    vi.advanceTimersByTime(100);
    controller.handleKey("down");
    vi.advanceTimersByTime(5000); // burst settles
    controller.handleKey("down"); // fresh single press
    vi.advanceTimersByTime(301);
    expect(mutes).toEqual([true]);
  });
});
