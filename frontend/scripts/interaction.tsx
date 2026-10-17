/**
 * Drives the built app in a real DOM: check a problem off, mark a re-solve,
 * read the progress wall, and watch the pet, streak and heatmap follow.
 * Run with scripts/verify.sh.
 */
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

// Node exposes some of these as getter-only globals, so define each explicitly.
function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('navigator', window.navigator);
setGlobal('localStorage', window.localStorage);
setGlobal('HTMLElement', window.HTMLElement);
setGlobal('Event', window.Event);
setGlobal('MouseEvent', window.MouseEvent);
setGlobal('getComputedStyle', window.getComputedStyle.bind(window));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});

// No API in this harness: the app must stay fully usable offline.
setGlobal('fetch', () => Promise.reject(new Error('offline')));

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

const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { default: App } = await import('../src/App');
const { PROBLEMS } = await import('../src/data/problems');
const { addDays, todayISO, STORE_KEY } = await import('../src/lib/state');
const { shiftDay } = await import('../src/lib/streak');

const root0 = document.getElementById('root') as HTMLElement;
const today = todayISO();

function mount() {
  const container = document.createElement('div');
  root0.appendChild(container);
  const root = createRoot(container);
  return { root, container };
}

async function renderApp() {
  // Every mount starts on the landing view, whatever the last section was.
  window.location.hash = '#/home';
  const mounted = mount();
  await act(async () => {
    mounted.root.render(createElement(App));
  });
  return mounted;
}

function store() {
  const raw = localStorage.getItem(STORE_KEY);
  return raw ? (JSON.parse(raw) as { entries: Record<string, { solvedOn: string; marks: Record<string, string> }>; activity: Record<string, number> }) : null;
}

function navTo(label: string) {
  const buttons = [...document.querySelectorAll('.navitem')];
  const target = buttons.find((b) => b.textContent?.includes(label));
  if (!target) throw new Error(`no nav item ${label}`);
  (target as HTMLElement).click();
}

function click(el: Element | null | undefined) {
  if (!el) throw new Error('element missing');
  (el as HTMLElement).click();
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const attr = (selector: string, name: string) => document.querySelector(selector)?.getAttribute(name) ?? null;

console.log('\nfirst-run interaction');
localStorage.clear();
let { root, container } = await renderApp();

check('the app lands on today', Boolean(document.querySelector('.panel--pet')));
check('the pet starts asleep', Boolean(document.querySelector('.pet--asleep')));
check('the heatmap is drawn', document.querySelectorAll('.heat__cell').length === 182, String(document.querySelectorAll('.heat__cell').length));
check('the streak starts at zero', text('.ledger__v').trim() === '0', text('.ledger__v'));
check('starts with no progress recorded', Object.keys(store()?.entries ?? {}).length === 0);

console.log('\nsolving a problem');
await act(async () => {
  navTo('Tracker');
});
const firstProblem = PROBLEMS[0];
const boxes = document.querySelectorAll('button[role="checkbox"]');
check('checkboxes are present', boxes.length === 14, String(boxes.length));

await act(async () => {
  click(boxes[0]);
});
const afterSolve = store();
check('checking a box writes progress to localStorage', Boolean(afterSolve?.entries[firstProblem.id]));
check('the solve date is today', afterSolve?.entries[firstProblem.id].solvedOn === today, afterSolve?.entries[firstProblem.id].solvedOn);
check('the day is recorded as active', afterSolve?.activity[today] === 1, JSON.stringify(afterSolve?.activity));

const row = document.getElementById(`prob-${firstProblem.id}`);
check('the row switches to solved', row?.getAttribute('data-solved') === 'true');
check('the status reads in progress', row?.textContent?.includes('In progress') === true);
check('the week tick turns partial', document.querySelector('.rail__tick')?.getAttribute('data-state') === 'partial');

console.log('\nthe pet and streak react');
await act(async () => {
  navTo('Today');
});
check('the pet wakes up and is content', Boolean(document.querySelector('.pet--content')), document.querySelector('.pet')?.className);
check('the pet shows today as fed', text('.feed__n').includes('1 problem'), text('.feed__n'));
check('the streak reads one day', text('.ledger__v').trim() === '1', text('.ledger__v'));
check('the ledger says today is logged', text('.ledger__flag').includes('logged today'));
check("today's heatmap cell lights up", attr('.heat__cell[data-today]', 'data-level') === '1', attr('.heat__cell[data-today]', 'data-level'));
check('the heatmap readout counts actions', text('.heat__readout').includes('1 action'), text('.heat__readout'));
check('a fresh day reports nothing due', document.body.textContent.includes('Nothing is due'));

console.log('\nre-solve marks');
await act(async () => {
  navTo('Tracker');
});
const solvedRow = document.getElementById(`prob-${firstProblem.id}`);
await act(async () => {
  click(solvedRow?.querySelector('button[data-mark="done"]'));
});
check('Day 3 done is recorded', store()?.entries[firstProblem.id].marks.day3 === 'done');

await act(async () => {
  click(document.getElementById(`prob-${firstProblem.id}`)?.querySelector('button[data-mark="redo"]'));
});
check('Day 3 redo replaces it', store()?.entries[firstProblem.id].marks.day3 === 'redo');
check('the row reports redo', document.getElementById(`prob-${firstProblem.id}`)?.textContent?.includes('Redo') === true);
check(
  'every action adds to the day, not just the first',
  store()?.activity[today] === 3,
  JSON.stringify(store()?.activity),
);

console.log('\nprogress view');
await act(async () => {
  navTo('Progress');
});
const cells = [...document.querySelectorAll('.wall__cell')];
check('the wall shows 150 squares', cells.length === 150, String(cells.length));
check('the solved problem fills its square', cells[0].getAttribute('data-f') === '1', cells[0].getAttribute('data-f') ?? '');
check('the redo square is flagged', cells[0].getAttribute('data-status') === 'redo');

console.log('\nmissed re-solve');
await act(async () => {
  root.unmount();
});
container.remove();

localStorage.clear();
const overdue = PROBLEMS[1];
localStorage.setItem(
  STORE_KEY,
  JSON.stringify({
    version: 2,
    planStart: today,
    entries: { [overdue.id]: { solvedOn: addDays(today, -4), marks: {} } },
    activity: { [addDays(today, -4)]: 1 },
  }),
);
({ root, container } = await renderApp());

check('the pet notices a lapsed run', Boolean(document.querySelector('.pet--droopy')), document.querySelector('.pet')?.className);
check('home counts the overdue re-solve', text('.pagehead__pulse').includes('1 re-solve'), text('.pagehead__pulse'));
check('the due list names the problem', text('.due').includes(overdue.title), text('.due'));
check('the rail reports one due', document.querySelectorAll('.rail__stat')[0]?.textContent?.includes('1') === true);

await act(async () => {
  navTo('Tracker');
});
const banner = document.querySelector('.banner');
check('a missed re-solve raises the banner', Boolean(banner));
check('the banner names the problem', banner?.textContent?.includes(overdue.title) === true);
check('the count is singular', banner?.textContent?.includes('1 re-solve is due today') === true);

const overdueRow = document.getElementById(`prob-${overdue.id}`);
check('the queue shows it as due today', overdueRow?.textContent?.includes('Re-solve due') === true);

await act(async () => {
  click(document.querySelector('.banner .chip'));
});
check('showing the queue filters the list down to it', document.querySelectorAll('.prob').length === 1, String(document.querySelectorAll('.prob').length));
check('the filtered week still reports its full size', document.querySelector('.week__ratio')?.textContent === '1/14', document.querySelector('.week__ratio')?.textContent ?? 'none');

console.log('\na three-day run');
await act(async () => {
  root.unmount();
});
container.remove();

localStorage.clear();
localStorage.setItem(
  STORE_KEY,
  JSON.stringify({
    version: 2,
    planStart: shiftDay(today, -7),
    entries: Object.fromEntries(
      [0, -1, -2].map((offset) => [
        PROBLEMS[Math.abs(offset)].id,
        { solvedOn: shiftDay(today, offset), marks: offset === 0 ? {} : { day3: 'done' } },
      ]),
    ),
    activity: { [today]: 1, [shiftDay(today, -1)]: 3, [shiftDay(today, -2)]: 2 },
  }),
);
({ root, container } = await renderApp());

check('a three-day run makes the pet radiant', Boolean(document.querySelector('.pet--radiant')), document.querySelector('.pet')?.className);
check('the ledger shows the run', text('.ledger__v').trim() === '3', text('.ledger__v'));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const yesterdayLabel = (() => {
  const [y, m, d] = shiftDay(today, -1).split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}: 3 logged`;
})();
check(
  'other days in the run carry their level',
  document.querySelector(`.heat__cell[aria-label="${yesterdayLabel}"]`)?.getAttribute('data-level') === '2',
  yesterdayLabel,
);
check('the ledger reports three active days', text('.ledger__rows').includes('3'), text('.ledger__rows'));

console.log('\nsigning in from the rail');
await act(async () => {
  navTo('Streak board');
});
check('the board asks a guest to make an account', document.body.textContent.includes('The board opens with an account'));

await act(async () => {
  navTo('Today');
  click(document.querySelector('.rail__signin'));
});
check('the auth screen opens', document.body.textContent.includes('Keep the streak in one place'));
check('the sign-up form has three fields', document.querySelectorAll('.authpage .field').length === 3, String(document.querySelectorAll('.authpage .field').length));

await act(async () => {
  click([...document.querySelectorAll('.panel__link')].find((b) => b.textContent?.includes('I have one')));
});
check('the form switches to sign in', document.body.textContent.includes('Welcome back'));
check('sign in asks for two fields', document.querySelectorAll('.authpage .field').length === 2);
check(
  'a sign-in attempt without the API reports it instead of hanging',
  (await (async () => {
    const email = document.querySelector<HTMLInputElement>('input[type="email"]');
    const password = document.querySelector<HTMLInputElement>('input[type="password"]');
    if (!email || !password) return false;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(email, 'a@b.co');
      email.dispatchEvent(new window.Event('input', { bubbles: true }));
      setValue?.call(password, 'password123');
      password.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      click(document.querySelector('button[type="submit"]'));
    });
    return document.body.textContent.includes('not reachable') || document.body.textContent.includes('went wrong');
  })()),
);

console.log('\nhistory is preserved');
check('progress survived every remount', Object.keys(store()?.entries ?? {}).length === 3, String(Object.keys(store()?.entries ?? {}).length));

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exitCode = 1;
}
