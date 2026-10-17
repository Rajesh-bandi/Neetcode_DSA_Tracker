/** ISO date maths. Days are `YYYY-MM-DD` in the reader's own calendar. */

const DAY_MS = 86_400_000;

export function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / DAY_MS);
}

export type Streaks = {
  /** Run of consecutive days ending today (or yesterday, while today is still open). */
  current: number;
  longest: number;
  activeToday: boolean;
  totalDays: number;
};

export function streaks(days: Iterable<string>, today: string): Streaks {
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
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  return { current, longest, activeToday: set.has(today), totalDays: set.size };
}

/* --------------------------------------------------------------- heatmap -- */

export type Cell = { day: string; count: number; level: 0 | 1 | 2 | 3 | 4; future: boolean };
export type Column = { key: string; cells: Cell[]; month: string | null };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function level(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

/**
 * Contribution-style grid: `weeks` columns of Monday-to-Sunday, ending with the
 * week that contains today. Weeks start on Monday so the plan's own weeks line
 * up with the grid.
 */
export function heatmap(counts: Record<string, number>, today: string, weeks = 26): { columns: Column[]; start: string; end: string } {
  const weekday = (new Date(`${today}T00:00:00`).getDay() + 6) % 7; // Monday = 0
  const end = shiftDay(today, 6 - weekday); // the coming Sunday
  const start = shiftDay(end, -(weeks * 7 - 1));

  const columns: Column[] = [];
  for (let w = 0; w < weeks; w += 1) {
    const cells: Cell[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = shiftDay(start, w * 7 + d);
      const count = counts[day] ?? 0;
      cells.push({ day, count, level: level(count), future: dayDiff(today, day) > 0 });
    }
    const first = cells[0].day;
    const previous = columns.at(-1)?.cells[0].day;
    const month =
      !previous || new Date(`${first}T00:00:00`).getMonth() !== new Date(`${previous}T00:00:00`).getMonth()
        ? MONTHS[new Date(`${first}T00:00:00`).getMonth()]
        : null;
    columns.push({ key: first, cells, month });
  }

  return { columns, start, end };
}

/** Fraction of the last `days` days with activity, used for consistency labels. */
export function consistency(counts: Record<string, number>, today: string, days = 28): number {
  let active = 0;
  for (let i = 0; i < days; i += 1) {
    if ((counts[shiftDay(today, -i)] ?? 0) > 0) active += 1;
  }
  return Math.round((active / days) * 100);
}
