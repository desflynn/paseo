import { formatDuration } from "@/utils/time";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "16:04" today, "16:04 Saturday" within the week, "16:04 on Sunday 27/09/2026" before. */
function formatStoppedAt(completedAt: Date, now: Date): string {
  const time = `${pad(completedAt.getHours())}:${pad(completedAt.getMinutes())}`;
  const daysAgo = Math.round((startOfDay(now) - startOfDay(completedAt)) / DAY_MS);
  const weekday = WEEKDAYS[completedAt.getDay()];
  if (daysAgo <= 0) return time;
  if (daysAgo < 7) return `${time} ${weekday}`;
  const date = `${pad(completedAt.getDate())}/${pad(completedAt.getMonth() + 1)}/${completedAt.getFullYear()}`;
  return `${time} on ${weekday} ${date}`;
}

/** Footer under a halted assistant turn: how long it worked and when it stopped. */
export function getAssistantTurnFooterLabel(input: {
  completedAt?: Date;
  durationMs?: number | null;
  now?: Date;
}): string {
  if (!input.completedAt) return "";
  const stopped = `Stopped at ${formatStoppedAt(input.completedAt, input.now ?? new Date())}`;
  return input.durationMs === undefined || input.durationMs === null
    ? stopped
    : `Worked for ${formatDuration(input.durationMs)} · ${stopped}`;
}
