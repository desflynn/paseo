import assert from "node:assert/strict";
import { test } from "node:test";

import { formatStoppedAt } from "./stopped-at.ts";

// Wednesday 7 Oct 2026, 18:00 local — the app footer fixtures.
const now = new Date(2026, 9, 7, 18, 0);

test("stopped at shows today's time alone", () => {
  assert.equal(formatStoppedAt(new Date(2026, 9, 7, 16, 4), now), "Stopped at 16:04");
});

test("stopped at names the weekday within the last week", () => {
  assert.equal(formatStoppedAt(new Date(2026, 9, 3, 16, 4), now), "Stopped at 16:04 Saturday");
});

test("stopped at gives the full date when older", () => {
  assert.equal(
    formatStoppedAt(new Date(2026, 8, 27, 16, 4), now),
    "Stopped at 16:04 on Sunday 27/09/2026",
  );
});

test("stopped at pads hours and minutes", () => {
  assert.equal(formatStoppedAt(new Date(2026, 9, 7, 9, 5), now), "Stopped at 09:05");
});

test("stopped at switches to the full date at seven days", () => {
  assert.equal(
    formatStoppedAt(new Date(2026, 8, 30, 16, 4), now),
    "Stopped at 16:04 on Wednesday 30/09/2026",
  );
});
