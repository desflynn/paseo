import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMessageTimestamp } from "./message-time.ts";

// Expected strings are built exactly the way the app's
// packages/app/src/utils/time.ts builds them (same Intl calls), so the test
// asserts branch selection and stays locale-proof on any machine.
function expectedTime(date: Date): string {
  const resolved = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).resolvedOptions();
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: resolved.hourCycle,
  }).format(date);
}

// Fixed `now`: 7 Oct 2026, 20:12 local time.
const NOW = new Date(2026, 9, 7, 20, 12, 0);

test("message-time: today shows the time only", () => {
  const date = new Date(2026, 9, 7, 8, 5, 0);
  assert.equal(formatMessageTimestamp(date, NOW), expectedTime(date));
});

test("message-time: a weekday within the week prefixes the weekday", () => {
  const date = new Date(2026, 9, 4, 9, 41, 0); // 3 calendar days back
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  assert.equal(formatMessageTimestamp(date, NOW), `${weekday} ${expectedTime(date)}`);
});

test("message-time: older than a week shows date and time", () => {
  const date = new Date(2026, 8, 27, 14, 5, 0); // 10 calendar days back
  const dateLabel = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  assert.equal(formatMessageTimestamp(date, NOW), `${dateLabel}, ${expectedTime(date)}`);
});
