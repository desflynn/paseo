import { describe, expect, it } from "vitest";

import { getAssistantTurnFooterLabel } from "./assistant-turn-footer-label";

describe("getAssistantTurnFooterLabel", () => {
  // Wednesday 7 Oct 2026, 18:00 local.
  const now = new Date(2026, 9, 7, 18, 0);

  it("shows duration and today's stop time", () => {
    const completedAt = new Date(2026, 9, 7, 16, 4);
    expect(getAssistantTurnFooterLabel({ completedAt, durationMs: 63_000, now })).toBe(
      "Worked for 1m 3s · Stopped at 16:04",
    );
  });

  it("names the weekday within the last week", () => {
    const completedAt = new Date(2026, 9, 3, 16, 4);
    expect(getAssistantTurnFooterLabel({ completedAt, durationMs: 63_000, now })).toBe(
      "Worked for 1m 3s · Stopped at 16:04 Saturday",
    );
  });

  it("gives the full date when older", () => {
    const completedAt = new Date(2026, 8, 27, 16, 4);
    expect(getAssistantTurnFooterLabel({ completedAt, durationMs: 63_000, now })).toBe(
      "Worked for 1m 3s · Stopped at 16:04 on Sunday 27/09/2026",
    );
  });

  it("shows the stop time alone when the turn has no visible start", () => {
    const completedAt = new Date(2026, 9, 7, 9, 5);
    expect(getAssistantTurnFooterLabel({ completedAt, durationMs: null, now })).toBe(
      "Stopped at 09:05",
    );
  });

  it("is empty without a completion time", () => {
    expect(getAssistantTurnFooterLabel({ now })).toBe("");
  });
});
