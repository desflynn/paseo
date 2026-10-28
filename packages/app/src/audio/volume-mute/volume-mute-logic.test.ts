import { describe, expect, it } from "vitest";
import { createVolumeMuteLogic } from "./volume-mute-logic";

/**
 * Des's final ducking spec (28 Oct, superseding the burst-debounce): one volume-down
 * press mutes the playing speech AT ONCE; the NEXT volume step in EITHER direction
 * resumes playback at the new system volume; repeatable mid-utterance. No windows,
 * no settling — every key press takes effect the moment it lands.
 */
describe("volume mute logic", () => {
  it("a single down press mutes at once — no debounce window", () => {
    const logic = createVolumeMuteLogic();
    expect(logic.isMuted()).toBe(false);
    logic.down();
    expect(logic.isMuted()).toBe(true);
  });

  it("the next step in either direction resumes: a second down unmutes", () => {
    const logic = createVolumeMuteLogic();
    logic.down();
    expect(logic.isMuted()).toBe(true);
    logic.down();
    expect(logic.isMuted()).toBe(false);
  });

  it("the next step in either direction resumes: an up press unmutes", () => {
    const logic = createVolumeMuteLogic();
    logic.down();
    logic.up();
    expect(logic.isMuted()).toBe(false);
  });

  it("an up press while unmuted changes nothing", () => {
    const logic = createVolumeMuteLogic();
    logic.up();
    expect(logic.isMuted()).toBe(false);
  });

  it("mutes and resumes repeat mid-utterance, one step at a time", () => {
    const logic = createVolumeMuteLogic();
    logic.down();
    expect(logic.isMuted()).toBe(true);
    logic.down();
    expect(logic.isMuted()).toBe(false);
    logic.up();
    expect(logic.isMuted()).toBe(false);
    logic.down();
    expect(logic.isMuted()).toBe(true);
    logic.up();
    expect(logic.isMuted()).toBe(false);
  });

  it("rapid downs toggle per press: mute, resume, mute", () => {
    const logic = createVolumeMuteLogic();
    logic.down();
    logic.down();
    logic.down();
    expect(logic.isMuted()).toBe(true);
  });

  it("playback stopping resets everything", () => {
    const logic = createVolumeMuteLogic();
    logic.down();
    logic.playbackStopped();
    expect(logic.isMuted()).toBe(false);
  });
});
