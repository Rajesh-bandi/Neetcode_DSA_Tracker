/**
 * Behaviour check for the app: data integrity, re-solve status logic, streak
 * maths, the guest/account merge and the server-rendered markup of every view.
 * Run with scripts/verify.sh.
 */
import { renderToString } from 'react-dom/server';
import { createElement, useState, type ReactElement } from 'react';
import App from '../src/App';
import { TrackerView } from '../src/views/TrackerView';
import { ProgressView } from '../src/views/ProgressView';
import { MethodView } from '../src/views/MethodView';
import { HomeView } from '../src/views/HomeView';
import { LeaderboardView } from '../src/views/LeaderboardView';
import { AuthView } from '../src/views/AuthView';
import { DIFFICULTY_TOTALS, PROBLEMS, TOTAL, WEEKS } from '../src/data/problems';
import { RULE } from '../src/data/method';
import {
  addDays,
  buildSchedule,
  derive,
  daysBetween,
  emptyStore,
  mondayOf,
  todayISO,
  upgradeStore,
  useTracker,
  type Entry,
} from '../src/lib/state';
import { consistency, heatmap, level, shiftDay, streaks } from '../src/lib/streak';
import { mergeProgress } from '../src/lib/sync';
import { AuthProvider } from '../src/lib/auth';

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.log(`  ok    ${name}`);
  }
}

/* ------------------------------------------------------------------- data */
console.log('\ndata');
check('150 problems', TOTAL === 150, `got ${TOTAL}`);
check(
  'week counts match the sheet',
  WEEKS.map((w) => w.count).join(',') === '14,13,13,11,15,15,12,13,14,12,11,7',
  WEEKS.map((w) => w.count).join(','),
);
check(
  'difficulty totals match the Progress tab (28/101/21)',
  DIFFICULTY_TOTALS.Easy === 28 && DIFFICULTY_TOTALS.Medium === 101 && DIFFICULTY_TOTALS.Hard === 21,
  JSON.stringify(DIFFICULTY_TOTALS),
);
check('every problem has a LeetCode link', PROBLEMS.every((p) => p.problemUrl.includes('leetcode.com/problems/')));
check('every problem has a video link', PROBLEMS.every((p) => p.videoUrl.includes('youtube.com/watch')));
check('every premium problem has a free mirror', PROBLEMS.filter((p) => p.premium).every((p) => p.freeUrl?.startsWith('http')));
check('exactly 7 premium problems', PROBLEMS.filter((p) => p.premium).length === 7);
check('every problem has a stable unique id', new Set(PROBLEMS.map((p) => p.id)).size === TOTAL);
check('12 weeks of 7 day slots', WEEKS.every((w) => w.days === 7));
check('every problem sits in day 1-7', PROBLEMS.every((p) => p.day >= 1 && p.day <= 7));
check('every problem sits in week 1-12', PROBLEMS.every((p) => p.week >= 1 && p.week <= 12));

/* ----------------------------------------------------------------- status */
console.log('\nre-solve status');
const today = todayISO();
const week1 = PROBLEMS[0];

check('unsolved reads not started', derive(week1, null, today).status === 'not-started');

const fresh: Entry = { solvedOn: today, marks: {} };
const freshDerived = derive(week1, fresh, today);
check('solved today is in progress', freshDerived.status === 'in-progress');
check('day 3 is the next re-solve', freshDerived.nextStage === 'day3');
check('day 3 falls three days out', daysBetween(today, freshDerived.due.day3) === 3);
check('day 7 falls seven days out', daysBetween(today, freshDerived.due.day7) === 7);
check('day 30 falls thirty days out', daysBetween(today, freshDerived.due.day30) === 30);

check('a missed day 3 reads re-solve due', derive(week1, { solvedOn: addDays(today, -4), marks: {} }, today).status === 'due');
check('a failed re-solve reads redo', derive(week1, { solvedOn: addDays(today, -8), marks: { day3: 'redo' } }, today).status === 'redo');

const midway = derive(week1, { solvedOn: addDays(today, -9), marks: { day3: 'done', day7: 'done' } }, today);
check('two re-solves in, day 30 pending reads in progress', midway.status === 'in-progress');
check('day 30 is next after day 3 and day 7', midway.nextStage === 'day30');

const mastered = derive(week1, { solvedOn: addDays(today, -31), marks: { day3: 'done', day7: 'done', day30: 'done' } }, today);
check('day 30 done reads mastered', mastered.status === 'mastered');
check('mastered fills the whole square', mastered.furthest === 3);
check('plan start is a Monday', new Date(`${mondayOf()}T00:00:00`).getDay() === 1);

/* ------------------------------------------------------------- schedule */
console.log('\nthe plan follows the reader, not the calendar');
const freshPlan = buildSchedule(today, WEEKS.length, {}, today);
check('a plan opened today puts day 1 on today', freshPlan.dateFor(1, 1) === today, freshPlan.dateFor(1, 1));
check('week 1 opens on today', freshPlan.weekRange(1).start === today, freshPlan.weekRange(1).start);
check('day 2 is tomorrow', freshPlan.dateFor(1, 2) === addDays(today, 1), freshPlan.dateFor(1, 2));
check(
  'a fresh plan sits on day 1',
  freshPlan.todaySlot?.week === 1 && freshPlan.todaySlot.day === 1,
  JSON.stringify(freshPlan.todaySlot),
);

const oneMissed = buildSchedule(addDays(today, -2), WEEKS.length, { [addDays(today, -2)]: 1 }, today);
check('a studied start day keeps its date', oneMissed.dateFor(1, 1) === addDays(today, -2), oneMissed.dateFor(1, 1));
check('a missed day hands its work to today', oneMissed.dateFor(1, 2) === today, oneMissed.dateFor(1, 2));
check('the day after that is tomorrow', oneMissed.dateFor(1, 3) === addDays(today, 1), oneMissed.dateFor(1, 3));
check('today is day 2 after one missed day', oneMissed.todaySlot?.day === 2, JSON.stringify(oneMissed.todaySlot));

const twoMissed = buildSchedule(addDays(today, -3), WEEKS.length, { [addDays(today, -3)]: 1 }, today);
check('two missed days still land today', twoMissed.dateFor(1, 2) === today, twoMissed.dateFor(1, 2));
check('nothing is scheduled in the past', twoMissed.dateFor(1, 1) >= addDays(today, -3) && twoMissed.dateFor(1, 2) >= today);
check('later weeks slide with it', twoMissed.weekRange(2).start === addDays(twoMissed.dateFor(1, 7), 1), twoMissed.weekRange(2).start);

check('a plan nobody has started anchors to today', emptyStore().planStart === today, emptyStore().planStart);
check(
  'a stale empty plan re-anchors to today',
  upgradeStore({ version: 2, planStart: addDays(today, -5), entries: {}, activity: {} }).planStart === today,
  upgradeStore({ version: 2, planStart: addDays(today, -5), entries: {}, activity: {} }).planStart,
);
check(
  'a plan with work behind it keeps its start',
  upgradeStore({
    version: 2,
    planStart: addDays(today, -5),
    entries: { [PROBLEMS[0].id]: { solvedOn: addDays(today, -5), marks: {} } },
    activity: { [addDays(today, -5)]: 1 },
  }).planStart === addDays(today, -5),
);
check(
  'a start the reader picked for later is kept',
  upgradeStore({ version: 2, planStart: addDays(today, 3), entries: {}, activity: {} }).planStart === addDays(today, 3),
);

/* ----------------------------------------------------------------- streak */
console.log('\nstreaks and heatmap');
const run = new Set([today, shiftDay(today, -1), shiftDay(today, -2), shiftDay(today, -6)]);
const s = streaks(run, today);
check('a run ending today counts from today', s.current === 3, JSON.stringify(s));
check('yesterday alone keeps the run alive', streaks([shiftDay(today, -1), shiftDay(today, -2)], today).current === 2);
check('a missed yesterday ends the run', streaks([shiftDay(today, -2)], today).current === 0);
check('the longest run is remembered', s.longest === 3 && s.totalDays === 4, JSON.stringify(s));
check('today is flagged as logged', s.activeToday === true);
check('no activity means no streak', streaks([], today).current === 0);

check('activity levels step up', level(0) === 0 && level(1) === 1 && level(4) === 3 && level(9) === 4);

const grid = heatmap({ [today]: 4 }, today, 26);
check('the heatmap is 26 weeks wide', grid.columns.length === 26, String(grid.columns.length));
check('every column holds seven days', grid.columns.every((c) => c.cells.length === 7));
check(
  'the grid ends in the week that contains today',
  grid.columns.at(-1)?.cells.some((c) => c.day === today) === true,
);
check('days after today are marked as future', grid.columns.at(-1)?.cells.filter((c) => c.future).length === (6 - ((new Date().getDay() + 6) % 7)));
check('today carries its activity level', grid.columns.at(-1)?.cells.find((c) => c.day === today)?.level === 3);
check('the grid starts on a Monday', new Date(`${grid.start}T00:00:00`).getDay() === 1);
check('month labels appear', grid.columns.filter((c) => c.month).length >= 5, String(grid.columns.filter((c) => c.month).length));

const busy = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [shiftDay(today, -i), 1]));
check('consistency is measured over the window', consistency(busy, today, 28) === 50, String(consistency(busy, today, 28)));
check('no activity reads as zero consistency', consistency({}, today, 28) === 0);

/* ------------------------------------------------------------------ merge */
console.log('\naccount merge');
const localRows = {
  'w1-1': { solvedOn: today, marks: {} },
  'w1-2': { solvedOn: addDays(today, -5), marks: { day3: 'done' } },
};
const local = { version: 2 as const, planStart: addDays(today, -10), entries: localRows, activity: { [today]: 2 } };
const remote = {
  planStart: addDays(today, -30),
  entries: {
    'w1-1': { solvedOn: addDays(today, -1), marks: { day3: 'done', day7: 'done', day30: 'done' } },
    'w2-1': { solvedOn: addDays(today, -2), marks: {} },
  },
  activity: { [today]: 1, [shiftDay(today, -1)]: 5 },
  updatedAt: null,
};

const merged = mergeProgress(local, remote);
check('the merge keeps local problems', Boolean(merged.entries['w1-1']) && Boolean(merged.entries['w1-2']));
check('the merge adopts remote problems', Boolean(merged.entries['w2-1']));
check('the further record wins for a problem', merged.entries['w1-1'].marks.day30 === 'done');
check('a local-only problem is untouched', merged.entries['w1-2'].marks.day3 === 'done');
check('the higher daily count wins', merged.activity[today] === 2);
check('a remote-only day is adopted', merged.activity[shiftDay(today, -1)] === 5);
check('the local plan start survives when work exists', merged.planStart === local.planStart);

const emptyLocal = { version: 2 as const, planStart: addDays(today, -10), entries: {}, activity: {} };
check('an empty device adopts the account plan', mergeProgress(emptyLocal, remote).planStart === remote.planStart);

/* ---------------------------------------------------------------- render */
console.log('\nrendered markup');

function HomeHarness() {
  return createElement(HomeView, {
    tracker: useTracker(),
    sync: { status: 'local', savedAt: null, error: null, retry: () => {} },
    onOpenDue: () => {},
    onOpenTracker: () => {},
    onOpenWeek: () => {},
    onOpenLeaderboard: () => {},
    onSignIn: () => {},
  });
}

function TrackerHarness() {
  const tracker = useTracker();
  const [open, setOpen] = useState<Set<number>>(new Set([tracker.planPosition?.week ?? 1]));
  return createElement(TrackerView, {
    tracker,
    openWeeks: open,
    setOpenWeeks: (update: (prev: Set<number>) => Set<number>) => setOpen((prev) => update(prev)),
    flashId: null,
  });
}

const progressHtml = renderToString(createElement(function P() {
  return createElement(ProgressView, { tracker: useTracker(), onOpenProblem: () => {} });
}));
const methodHtml = renderToString(createElement(function M() {
  return createElement(MethodView, { tracker: useTracker() });
}));
const trackerSimpleHtml = renderToString(createElement(TrackerView, {
  tracker: {
    store: { version: 2, planStart: mondayOf(), entries: {}, activity: {} },
    today,
    derived: PROBLEMS.map((p) => derive(p, null, today)),
    byId: new Map(PROBLEMS.map((p) => [p.id, derive(p, null, today)])),
    solvedCount: 0,
    masteredCount: 0,
    dueNow: [],
    redo: [],
    activeDays: {},
    streak: streaks([], today),
    toggleSolved: () => {},
    setMark: () => {},
    setNote: () => {},
    resetProblem: () => {},
    resetAll: () => {},
    setPlanStart: () => {},
    replaceStore: () => {},
    schedule: buildSchedule(mondayOf(), WEEKS.length, {}, today),
    planPosition: { week: 1, day: 1 },
  },
  openWeeks: new Set([1]),
  setOpenWeeks: () => {},
  flashId: null,
}));

// Home, the board and the auth screen read the session, so they need the provider.
const withAuth = (node: ReactElement) => createElement(AuthProvider, null, node);

const appHtml = renderToString(createElement(App));
const homeHtml = renderToString(withAuth(createElement(HomeHarness)));
const trackerHtml = renderToString(createElement(TrackerHarness));
const authHtml = renderToString(
  withAuth(createElement(AuthView, { mode: 'register', onMode: () => {}, onDone: () => {}, onSkip: () => {} })),
);
const boardHtml = renderToString(withAuth(createElement(LeaderboardView, { tracker: { today } as never, onSignIn: () => {} })));
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

check('the app renders without throwing', appHtml.length > 5000, `${appHtml.length} chars`);
check('five sections in the rail', count(appHtml, 'class="navitem"') === 5, String(count(appHtml, 'class="navitem"')));
check('the rail offers the streak board', appHtml.includes('Streak board'));
check('the account area offers the profile', appHtml.includes('Profile'));
check('a guest is offered a sign-in', appHtml.includes('Sign in to sync'));
check('today is the landing view', appHtml.includes('class="panel panel--pet"'));

check('home draws the pet', count(homeHtml, 'class="pet ') === 1 || homeHtml.includes('class="pet pet--'));
check('the pet ships an accessible label', homeHtml.includes('Gruv, the study cat'));
check('the pet sleeps before any work is logged', homeHtml.includes('pet--asleep'));
check('home shows the feeding counter', homeHtml.includes('0 problems'));
check('home draws a 26-week heatmap', count(homeHtml, 'role="gridcell"') === 182, String(count(homeHtml, 'role="gridcell"')));
check('heatmap cells describe their day', homeHtml.includes('nothing logged'));
check('home shows the streak ledger', homeHtml.includes('day streak'));
check('home names the next unsolved problem', homeHtml.includes(PROBLEMS[0].title));
check('guests are told where the streak lives', homeHtml.includes('streak saved in this browser only'));
check('the board teaser invites an account', homeHtml.includes('The board is for accounts'));

check('tracker renders 12 week dropdowns', count(trackerHtml, 'class="week"') === 12, String(count(trackerHtml, 'class="week"')));
check('the current week is expanded by default', count(trackerHtml, 'class="prob"') === 14, String(count(trackerHtml, 'class="prob"')));
check('one checkbox per problem row', count(trackerHtml, 'role="checkbox"') === 14);
check('a problem link per row', count(trackerHtml, 'leetcode.com/problems/') === 14);
check('a video link per row', count(trackerHtml, 'youtube.com/watch') === 14);
check('day groups rendered', count(trackerHtml, 'daygroup__day') === 7, String(count(trackerHtml, 'daygroup__day')));
check('overall total shown', trackerHtml.includes('/150'));
check('tracker renders with no progress at all', trackerSimpleHtml.includes('Not started'));

check('progress renders without throwing', progressHtml.length > 2000, `${progressHtml.length} chars`);
check('150 wall squares', count(progressHtml, 'class="wall__cell"') === 150, String(count(progressHtml, 'class="wall__cell"')));
check('12 week bars', count(progressHtml, 'class="bar"') === 12);
check('five headline stats', count(progressHtml, 'class="stat"') === 5);
check('empty state invites action instead of showing a blank chart', progressHtml.includes('Nothing is scheduled yet'));

check('method renders the rule', methodHtml.includes(RULE));
check('method renders six loop steps', count(methodHtml, 'loopstep"') >= 6);
check('method lists twelve weeks', count(methodHtml, 'class="planrow"') === 12);

check('the sign-up form asks for username, Gmail and password', count(authHtml, 'class="field"') === 3, String(count(authHtml, 'class="field"')));
check('the sign-up form explains username and Gmail sign-in', authHtml.includes('Use your username, Gmail address, and password'));
check('the auth page carries the rule', authHtml.includes(RULE.slice(0, 40)));
check('the auth page supports username or Gmail sign-in', authHtml.includes('Sign in with your username or Gmail address'));

check('the board asks guests to sign in', boardHtml.includes('The board opens with an account'));
check('the board explains how a streak is counted', boardHtml.includes('How the run is counted'));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exitCode = 1;
}
