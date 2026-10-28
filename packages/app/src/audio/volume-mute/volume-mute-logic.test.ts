import { describe, expect, it } from "vitest";
import { createVolumeMuteLogic } from "./volume-mute-logic";

describe("volume mute logic", () => {
  it("a single down press mutes once the debounce window expires", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    expect(logic.isMuted()).toBe(false);
    logic.down(0);
    expect(logic.isMuted()).toBe(false); // not yet: the window is still open
    logic.tick(299);
    expect(logic.isMuted()).toBe(false);
    logic.tick(301);
    expect(logic.isMuted()).toBe(true); // single press settled: muted
  });

  it("rapid downs never mute: they are a volume burst", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(1000);
    logic.down(1100); // second press inside the window cancels the pending mute
    logic.tick(1401); // burst settles
    expect(logic.isMuted()).toBe(false);
  });

  it("a long burst of three downs never mutes", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(0);
    logic.down(150);
    logic.down(290);
    logic.tick(2000);
    expect(logic.isMuted()).toBe(false);
  });

  it("after a burst settles, a fresh single down mutes again", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(1000);
    logic.down(1100);
    logic.tick(2000); // settled, re-armed
    logic.down(3000);
    logic.tick(3301);
    expect(logic.isMuted()).toBe(true);
  });

  it("volume up unmutes", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(0);
    logic.tick(301);
    expect(logic.isMuted()).toBe(true);
    logic.up(400);
    expect(logic.isMuted()).toBe(false);
  });

  it("down while muted stays muted", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(0);
    logic.tick(301);
    logic.down(400);
    logic.tick(701);
    expect(logic.isMuted()).toBe(true);
  });

  it("a down press after the window is a fresh press, not a burst", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(1000);
    logic.tick(1301); // first press already settled into mute
    expect(logic.isMuted()).toBe(true);
    logic.up(1400);
    logic.down(2000); // fresh, well after any burst
    logic.tick(2301);
    expect(logic.isMuted()).toBe(true);
  });

  it("playback stopping resets everything", () => {
    const logic = createVolumeMuteLogic({ windowMs: 300 });
    logic.down(0);
    logic.tick(301);
    expect(logic.isMuted()).toBe(true);
    logic.playbackStopped();
    expect(logic.isMuted()).toBe(false);
    // A pending press is dropped too: the next playback starts clean.
    logic.down(5000);
    logic.playbackStopped();
    logic.tick(5401);
    expect(logic.isMuted()).toBe(false);
  });
});
