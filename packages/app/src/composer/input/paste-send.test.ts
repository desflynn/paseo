import { describe, expect, it } from "vitest";
import {
  diffTextInputChange,
  isPasteInsertion,
  resolvePasteAutoSend,
  AUTO_SEND_DELAY_MS,
} from "./paste-send";

describe("diffTextInputChange", () => {
  it("sees an appended multi-word phrase as one collapsed insertion", () => {
    expect(diffTextInputChange("", "please send this now")).toEqual({
      text: "please send this now",
      previousText: "",
      range: { start: 0, end: 0 },
    });
  });

  it("sees a single appended character as typing", () => {
    const event = diffTextInputChange("abc", "abch");
    expect(event?.text).toBe("h");
    expect(isPasteInsertion(event!)).toBe(false);
  });

  it("sees an autocorrect swap as a short replacement, not a paste", () => {
    const event = diffTextInputChange("teh", "the");
    expect(isPasteInsertion(event!)).toBe(false);
  });

  it("sees a multi-word paste over selected text as a paste", () => {
    const event = diffTextInputChange("old selected words", "new pasted words");
    expect(isPasteInsertion(event!)).toBe(true);
  });

  it("returns null when nothing changed", () => {
    expect(diffTextInputChange("same", "same")).toBeNull();
  });
});

describe("isPasteInsertion", () => {
  it("treats a single multi-character insertion as a paste", () => {
    expect(
      isPasteInsertion({
        text: "please send this message now",
        previousText: "",
        range: { start: 0, end: 0 },
      }),
    ).toBe(true);
  });

  it("treats a single character insertion as typing", () => {
    expect(isPasteInsertion({ text: "a", previousText: "", range: { start: 0, end: 0 } })).toBe(
      false,
    );
  });

  it("treats a whitespace-only insertion as typing", () => {
    expect(isPasteInsertion({ text: "  ", previousText: "", range: { start: 0, end: 0 } })).toBe(
      false,
    );
  });

  it("ignores a two-character autocorrect replacement that spans existing text", () => {
    // A replacement over existing characters is an edit, not a paste: the range it
    // replaces is not collapsed.
    expect(
      isPasteInsertion({ text: "the", previousText: "teh", range: { start: 0, end: 3 } }),
    ).toBe(false);
  });

  it("treats a paste over a selection as a paste", () => {
    // Pasting over selected text replaces a non-collapsed range in one event with a
    // multi-character payload — still a paste.
    expect(
      isPasteInsertion({
        text: "new pasted words",
        previousText: "old selected words",
        range: { start: 0, end: 18 },
      }),
    ).toBe(true);
  });

  it("ignores a single character replacing a selection", () => {
    expect(isPasteInsertion({ text: "x", previousText: "abc", range: { start: 0, end: 3 } })).toBe(
      false,
    );
  });
});

describe("resolvePasteAutoSend", () => {
  const paste = {
    text: "dictated phrase",
    previousText: "",
    range: { start: 0, end: 0 },
  };

  it("auto-sends an armed paste", () => {
    expect(resolvePasteAutoSend({ armed: true, event: paste })).toBe(true);
  });

  it("never auto-sends when the toggle is off", () => {
    expect(resolvePasteAutoSend({ armed: false, event: paste })).toBe(false);
  });

  it("never auto-sends typing while armed", () => {
    expect(
      resolvePasteAutoSend({
        armed: true,
        event: { text: "h", previousText: "", range: { start: 0, end: 0 } },
      }),
    ).toBe(false);
  });
});

describe("AUTO_SEND_DELAY_MS", () => {
  it("stays near-instant per Des's working number", () => {
    expect(AUTO_SEND_DELAY_MS).toBe(100);
  });
});
