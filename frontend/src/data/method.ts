// Content from the "Start Here" tab of the source spreadsheet, kept verbatim
// where the wording matters and grouped so the UI can lay it out.
import { WEEKS, TOTAL, DIFFICULTY_TOTALS } from './problems';

export const CREDIT = {
  author: 'Nihar',
  handle: '@niihaaarrrr',
  problemList: 'NeetCode 150 by NeetCode (neetcode.io)',
  note: 'Arranged into 12 weeks for this video.',
};

export const RULE =
  'Solving a problem once is not learning it. A problem is yours only when you can solve it again on Day 30, on a blank page, without looking.';

export const LOOP: { step: number; title: string; body: string }[] = [
  {
    step: 1,
    title: 'Twenty minutes, solution tab closed',
    body: 'Set a 20-minute timer. Close the solution tab. Write whatever idea comes first, even brute force.',
  },
  {
    step: 2,
    title: 'Stuck? Read the idea, not the code',
    body: 'Stuck after 20 minutes? Read the idea only (or watch the solution video), not the code. Close it and write the code yourself.',
  },
  {
    step: 3,
    title: 'Write the complexity first',
    body: 'Write Time and Space complexity at the top of your code. Every problem, every time.',
  },
  {
    step: 4,
    title: 'Find a second approach',
    body: 'After Accepted, open the Discuss / Solutions tab. Find a second approach and compare the two.',
  },
  {
    step: 5,
    title: 'Name the pattern',
    body: 'Name the pattern and write a one-line trigger: when you see X in a question, think Y.',
  },
  {
    step: 6,
    title: 'Explain it, then re-solve it',
    body: 'Record yourself explaining it in 2 minutes. Then re-solve it on Day 3, Day 7 and Day 30. Day 30 on paper, no compiler.',
  },
];

export const HOW_TO_FILL: string[] = [
  'Day 1 date: the date you first solve it. Day 3, Day 7 and Day 30 due dates appear automatically.',
  'Time / Space, Pattern, Trigger line: write these yourself. Writing them is the learning.',
  'Day 3 / Day 7 / Day 30: pick Done or Redo from the dropdown on that day.',
  'Redo means you could not re-solve it. Change the Day 1 date to today and clear the Day 3, Day 7 and Day 30 boxes. The calendar restarts.',
  'Status tells you what to do: Re-solve due (do it today), In progress, Redo, or Mastered (Day 30 done).',
  'Premium problems have a free version link in the Free link column.',
];

export const DAILY_ROUTINE: { minutes: string; body: string }[] = [
  { minutes: '60-80m', body: '1 to 2 new problems with the full 6-step loop.' },
  {
    minutes: '30m',
    body: 'Every re-solve marked Re-solve due on the Tracker (filter the Status column).',
  },
  { minutes: '30m', body: 'Core CS (OS, DBMS, SQL, OOP). From week 1, not after DSA.' },
];

export const WEEK_PLAN = WEEKS.map((w) => ({
  week: w.week,
  label: w.topics.join(' + '),
  count: w.count,
  closing: w.week === 12,
}));

export const PLAN_NOTE =
  'Week 12 has fewer new problems on purpose. Use the extra time to re-solve every problem not yet marked Mastered.';

export const SUMMARY = {
  total: TOTAL,
  weeks: WEEKS.length,
  easy: DIFFICULTY_TOTALS.Easy,
  medium: DIFFICULTY_TOTALS.Medium,
  hard: DIFFICULTY_TOTALS.Hard,
  reSolves: 3,
};
