/** ISO date helpers. All days are `YYYY-MM-DD` in the user's local calendar. */

const DAY_MS = 86_400_000;

export function isIsoDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function serverDay(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Longest run of consecutive active days, and the run that is still alive.
 * A streak survives until the end of today: if nothing is logged today yet,
 * yesterday's run still counts.
 */
export function streaks(days, today) {
  const set = days instanceof Set ? days : new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return { current, longest, activeToday: set.has(today), totalDays: set.size };
}

export function isRecentDay(day, today = serverDay(), tolerance = 1) {
  if (!isIsoDay(day)) return false;
  const diff = Math.abs((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  return diff <= tolerance;
}
