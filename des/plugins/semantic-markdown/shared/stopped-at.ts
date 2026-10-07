const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Muted line under the last assistant message of a halted turn. Ported from the
 * app's assistant-turn-footer-label.ts: "16:04" today, "16:04 Saturday" within
 * the week, "16:04 on Sunday 27/09/2026" before.
 */
export function formatStoppedAt(completedAt: Date, now: Date): string {
  const time = `${pad(completedAt.getHours())}:${pad(completedAt.getMinutes())}`;
  const daysAgo = Math.round((startOfDay(now) - startOfDay(completedAt)) / DAY_MS);
  const weekday = WEEKDAYS[completedAt.getDay()];
  if (daysAgo <= 0) return `Stopped at ${time}`;
  if (daysAgo < 7) return `Stopped at ${time} ${weekday}`;
  const date = `${pad(completedAt.getDate())}/${pad(completedAt.getMonth() + 1)}/${completedAt.getFullYear()}`;
  return `Stopped at ${time} on ${weekday} ${date}`;
}
