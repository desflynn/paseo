// Ported from packages/app/src/utils/time.ts (formatMessageTimestamp + its two
// helpers) so callout card footers format timestamps exactly like the app's
// user-message footer. Copied, not imported: the plugin builds and ships its own
// bundle outside the app's source tree. Re-copy if the app's code changes.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How many local midnights lie between two instants: 0 for the same day, 1 for yesterday.
 * Counted on the calendar rather than in elapsed time, so six days and 23 hours ago on
 * today's weekday is 7, and rounded so a DST day of 23 or 25 hours still counts as one.
 */
function localCalendarDaysBetween(earlier: Date, later: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS);
}

// Cached Intl formatter. Explicitly carrying `hourCycle` from the resolved
// options is what makes the runtime respect the user's OS-level 12h/24h
// preference rather than the locale's default cycle.
let cachedTimeFormatter: Intl.DateTimeFormat | null = null;
function getTimeFormatter(): Intl.DateTimeFormat {
  if (cachedTimeFormatter) return cachedTimeFormatter;
  const resolved = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).resolvedOptions();
  cachedTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: resolved.hourCycle,
  });
  return cachedTimeFormatter;
}

/**
 * Format a chat-message timestamp for hover-revealed UI.
 * - Same day: "10:11 PM" or "22:11" depending on user preference
 * - The previous 6 calendar days: "Wednesday 10:11 PM"
 * - Older, including today's weekday last week: "14 May 2026, 10:11 PM"
 */
export function formatMessageTimestamp(date: Date, now: Date = new Date()): string {
  const time = getTimeFormatter().format(date);
  const daysAgo = localCalendarDaysBetween(date, now);

  if (daysAgo === 0) {
    return time;
  }

  if (daysAgo > 0 && daysAgo < 7) {
    const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
    return `${weekday} ${time}`;
  }

  const dateLabel = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dateLabel}, ${time}`;
}
