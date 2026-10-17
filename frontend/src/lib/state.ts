import { useCallback, useEffect, useMemo, useState } from 'react';
import { PROBLEMS, WEEKS, type Problem } from '../data/problems';
import { streaks, type Streaks } from './streak';

export const STAGES = ['day3', 'day7', 'day30'] as const;
export type Stage = (typeof STAGES)[number];
export type Mark = 'done' | 'redo';

export type NoteField = 'timeSpace' | 'pattern' | 'trigger';
export type Notes = Partial<Record<NoteField, string>>;

export type Entry = {
  /** ISO date the problem was first solved (the sheet's "Day 1 date"). */
  solvedOn: string;
  marks: Partial<Record<Stage, Mark>>;
  notes?: Notes;
};

export type Store = {
  version: 2;
  /** ISO date for the Monday that starts week 1 of the plan. */
  planStart: string;
  entries: Record<string, Entry>;
  /** ISO day → study actions logged that day. Feeds the streak and the heatmap. */
  activity: Record<string, number>;
};

export const STAGE_OFFSET: Record<Stage, number> = { day3: 3, day7: 7, day30: 30 };
export const STAGE_LABEL: Record<Stage, string> = { day3: 'Day 3', day7: 'Day 7', day30: 'Day 30' };

export const STORE_KEY = 'nc150.tracker.v1';

/* ---------------------------------------------------------------- dates -- */

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  const MS = 86_400_000;
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / MS);
}

export function todayISO(): string {
  return toISO(new Date());
}

export function mondayOf(date = new Date()): string {
  const d = new Date(date);
  const shift = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - shift);
  return toISO(d);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 19 Oct */
export function shortDate(iso: string): string {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Mon 19 Oct */
export function longDate(iso: string): string {
  const d = fromISO(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "in 4 days", "today", "3 days ago" */
export function relativeDay(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/* --------------------------------------------------------------- status -- */

export type Status = 'not-started' | 'in-progress' | 'due' | 'redo' | 'mastered';

export const STATUS_LABEL: Record<Status, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  due: 'Re-solve due',
  redo: 'Redo',
  mastered: 'Mastered',
};

export type Derived = {
  problem: Problem;
  entry: Entry | null;
  status: Status;
  solvedOn: string | null;
  due: Record<Stage, string>;
  nextStage: Stage | null;
  nextDue: string | null;
  /** Furthest stage reached, used by the progress wall. */
  furthest: 0 | 1 | 2 | 3;
};

export function derive(problem: Problem, entry: Entry | null, today: string): Derived {
  const solvedOn = entry?.solvedOn ?? null;
  const due: Record<Stage, string> = {
    day3: solvedOn ? addDays(solvedOn, 3) : '',
    day7: solvedOn ? addDays(solvedOn, 7) : '',
    day30: solvedOn ? addDays(solvedOn, 30) : '',
  };

  let nextStage: Stage | null = null;
  for (const stage of STAGES) {
    if (solvedOn && !entry?.marks[stage]) {
      nextStage = stage;
      break;
    }
  }
  const nextDue = nextStage ? due[nextStage] : null;

  let furthest: 0 | 1 | 2 | 3 = 0;
  if (entry) {
    furthest = 1;
    if (entry.marks.day3 === 'done') furthest = 2;
    if (entry.marks.day7 === 'done') furthest = 2;
    if (entry.marks.day30 === 'done') furthest = 3;
  }

  let status: Status = 'not-started';
  if (entry) {
    if (entry.marks.day30 === 'done') status = 'mastered';
    else if (STAGES.some((s) => entry.marks[s] === 'redo')) status = 'redo';
    else if (nextDue && daysBetween(today, nextDue) <= 0) status = 'due';
    else status = 'in-progress';
  }

  return { problem, entry, status, solvedOn, due, nextStage, nextDue, furthest };
}

/* ---------------------------------------------------------------- store -- */

export function emptyStore(): Store {
  // A new plan starts the day you open it, not the Monday of that week: day 1
  // has to be today or the first days read as already missed.
  return { version: 2, planStart: todayISO(), entries: {}, activity: {} };
}

export type PlanSlot = { week: number; day: number; date: string };

export type PlanSchedule = {
  /** Suggested date for a week/day slot, after the plan has slid forward. */
  dateFor: (week: number, day: number) => string;
  weekRange: (week: number) => { start: string; end: string };
  /** The slot today falls on. Null before the plan starts or after it ends. */
  todaySlot: { week: number; day: number } | null;
};

/**
 * Study-day dates. Each week has seven day slots; a calendar day that comes and
 * goes with nothing logged hands its work to the next study day instead of
 * letting the plan fall behind, so today's slot is always today's work.
 */
export function buildSchedule(
  planStart: string,
  weeks: number,
  activeDays: Record<string, number>,
  today: string,
): PlanSchedule {
  const studied = (day: string) => (activeDays[day] ?? 0) > 0;
  const slots: PlanSlot[] = [];
  let cursor = planStart;

  for (let week = 1; week <= weeks; week += 1) {
    for (let day = 1; day <= 7; day += 1) {
      // Days before today with no work recorded were missed; skip them so the
      // rest of the plan moves up rather than going overdue.
      while (cursor < today && !studied(cursor)) cursor = addDays(cursor, 1);
      slots.push({ week, day, date: cursor });
      cursor = addDays(cursor, 1);
    }
  }

  const dates = new Map(slots.map((s) => [`${s.week}-${s.day}`, s.date]));
  const straightThrough = (week: number, day: number) => addDays(planStart, (week - 1) * 7 + (day - 1));
  const todays = slots.find((s) => s.date === today) ?? null;

  return {
    dateFor: (week, day) => dates.get(`${week}-${day}`) ?? straightThrough(week, day),
    weekRange: (week) => ({
      start: dates.get(`${week}-1`) ?? straightThrough(week, 1),
      end: dates.get(`${week}-7`) ?? straightThrough(week, 7),
    }),
    todaySlot: todays ? { week: todays.week, day: todays.day } : null,
  };
}

/** Adds the day's action to the tally the streak is built from. */
export function bumpActivity(activity: Record<string, number>, day: string): Record<string, number> {
  return { ...activity, [day]: (activity[day] ?? 0) + 1 };
}

/**
 * Removes an entry and takes back the action its solve added, so unchecking a
 * problem also drops the day's tally. Without this the streak, heatmap and pet
 * stay fed by work that is no longer on the board.
 */
export function dropEntry(prev: Store, id: string): Store {
  const entry = prev.entries[id];
  if (!entry) return prev;
  const entries = { ...prev.entries };
  delete entries[id];
  const activity = { ...prev.activity };
  const left = (activity[entry.solvedOn] ?? 0) - 1;
  if (left > 0) activity[entry.solvedOn] = left;
  else delete activity[entry.solvedOn];
  return { ...prev, entries, activity };
}

/** Accepts stores written by older versions, so nothing is lost on upgrade. */
export function upgradeStore(parsed: unknown): Store {
  const base = emptyStore();
  if (!parsed || typeof parsed !== 'object') return base;
  const raw = parsed as Partial<Store> & { entries?: unknown };
  if (typeof raw.entries !== 'object' || raw.entries === null) return base;
  const entries = raw.entries as Record<string, Entry>;
  const activity =
    typeof raw.activity === 'object' && raw.activity !== null ? (raw.activity as Record<string, number>) : {};
  const stored = typeof raw.planStart === 'string' ? raw.planStart : null;
  // Nothing logged yet means the plan has not really started: anchor it to today
  // so a fresh reader sees day 1 today. A start the reader picked for the future
  // is kept, and once work exists the start is frozen.
  const started = Object.keys(entries).length > 0 || Object.keys(activity).length > 0;
  const planStart = started || !stored || stored >= base.planStart ? (stored ?? base.planStart) : base.planStart;
  return { version: 2, planStart, entries, activity };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? upgradeStore(JSON.parse(raw)) : emptyStore();
  } catch {
    return emptyStore();
  }
}

export type Tracker = {
  store: Store;
  today: string;
  derived: Derived[];
  byId: Map<string, Derived>;
  solvedCount: number;
  masteredCount: number;
  dueNow: Derived[];
  redo: Derived[];
  /** Every day with recorded activity, including days inferred from solve dates. */
  activeDays: Record<string, number>;
  streak: Streaks;
  toggleSolved: (id: string) => void;
  setMark: (id: string, stage: Stage, mark: Mark) => void;
  setNote: (id: string, field: NoteField, value: string) => void;
  resetProblem: (id: string) => void;
  resetAll: () => void;
  setPlanStart: (iso: string) => void;
  /** Used by the account sync to adopt a merged store. */
  replaceStore: (next: Store) => void;
  /** Day-slot dates for the whole plan, slid forward over missed days. */
  schedule: PlanSchedule;
  /** Which week/day of the plan today falls on, 1-indexed. */
  planPosition: { week: number; day: number } | null;
};

export function useTracker(): Tracker {
  const [store, setStore] = useState<Store>(() => load());
  const today = todayISO();

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* storage disabled - progress stays in memory */
    }
  }, [store]);

  const toggleSolved = useCallback((id: string) => {
    setStore((prev) => {
      if (prev.entries[id]) return dropEntry(prev, id);
      const day = todayISO();
      const entries = { ...prev.entries, [id]: { solvedOn: day, marks: {} } };
      return { ...prev, entries, activity: bumpActivity(prev.activity, day) };
    });
  }, []);

  const setMark = useCallback((id: string, stage: Stage, mark: Mark) => {
    setStore((prev) => {
      const existing = prev.entries[id];
      if (!existing) return prev;
      const marks = { ...existing.marks };
      if (marks[stage] === mark) delete marks[stage];
      else marks[stage] = mark;
      return {
        ...prev,
        entries: { ...prev.entries, [id]: { ...existing, marks } },
        activity: bumpActivity(prev.activity, todayISO()),
      };
    });
  }, []);

  const setNote = useCallback((id: string, field: NoteField, value: string) => {
    setStore((prev) => {
      const existing = prev.entries[id];
      if (!existing) return prev;
      const notes = { ...existing.notes };
      if (value) notes[field] = value;
      else delete notes[field];
      return { ...prev, entries: { ...prev.entries, [id]: { ...existing, notes } } };
    });
  }, []);

  const resetProblem = useCallback((id: string) => {
    setStore((prev) => dropEntry(prev, id));
  }, []);

  const resetAll = useCallback(() => {
    setStore((prev) => ({ ...prev, entries: {}, activity: {} }));
  }, []);

  const setPlanStart = useCallback((planStart: string) => {
    setStore((prev) => ({ ...prev, planStart }));
  }, []);

  const replaceStore = useCallback((next: Store) => {
    setStore(upgradeStore(next));
  }, []);

  const derived = useMemo(
    () => PROBLEMS.map((p) => derive(p, store.entries[p.id] ?? null, today)),
    [store.entries, today],
  );

  const byId = useMemo(() => new Map(derived.map((d) => [d.problem.id, d])), [derived]);

  const dueNow = useMemo(
    () =>
      derived
        .filter((d) => d.status === 'due')
        .sort((a, b) => (a.nextDue ?? '').localeCompare(b.nextDue ?? '')),
    [derived],
  );
  const redo = useMemo(() => derived.filter((d) => d.status === 'redo'), [derived]);

  // Days the app recorded, plus days implied by a solve date so a store written
  // before activity tracking still produces a streak.
  const activeDays = useMemo(() => {
    const days: Record<string, number> = { ...store.activity };
    for (const entry of Object.values(store.entries)) {
      days[entry.solvedOn] = Math.max(days[entry.solvedOn] ?? 0, 1);
    }
    return days;
  }, [store.activity, store.entries]);

  const schedule = useMemo(
    () => buildSchedule(store.planStart, WEEKS.length, activeDays, today),
    [store.planStart, activeDays, today],
  );

  const planPosition = schedule.todaySlot;

  const streak = useMemo(() => streaks(Object.keys(activeDays), today), [activeDays, today]);

  return {
    store,
    today,
    derived,
    byId,
    solvedCount: derived.filter((d) => d.entry).length,
    masteredCount: derived.filter((d) => d.status === 'mastered').length,
    dueNow,
    redo,
    activeDays,
    streak,
    toggleSolved,
    setMark,
    setNote,
    resetProblem,
    resetAll,
    setPlanStart,
    replaceStore,
    schedule,
    planPosition,
  };
}
