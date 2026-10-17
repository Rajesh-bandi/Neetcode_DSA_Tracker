# NeetCode 150 — twelve-week tracker

A study tracker built from the `DSA_12_Week_NeetCode150_Tracker.xlsx` workbook: all 150 problems with
their LeetCode and video links, the Day 3 / Day 7 / Day 30 re-solve schedule from the sheet, a streak
system with a heatmap and a leaderboard, and a small study companion who lives on the home page.

Gruvbox dark throughout. No UI or chart library — every graphic is drawn from the palette by hand.

```
frontend/   Vite + React + TypeScript single-page app
backend/    Express + Node's built-in SQLite: accounts, OTP, progress sync, streaks, leaderboard
data/       the workbook export the problem list is generated from
scripts/    dev runner for both halves
```

## Quick start

```bash
npm run setup     # installs backend/ and frontend/
npm run dev       # API on :8787, app on :3000 (frontend proxies /api to the API)
```

Open http://localhost:3000. Everything works as a guest — progress is kept in the browser until you
create an account, then it syncs both ways.

Production-style run (the API serves the built frontend):

```bash
npm run build     # builds frontend/dist
npm start         # serves the app and the API from :8787
```

## Accounts

Email + password, confirmed with a six-digit code.

**Without SMTP configured** the code is printed to the API console *and* shown on the verification
step, so you can sign up immediately. Set the mail variables to stop the code from reaching the
browser:

```bash
cp backend/.env.example backend/.env
```

For Gmail, `SMTP_PASS` must be a 16-character **Google App Password**, not the account password
(Google account → Security → 2-Step Verification → App passwords). Then:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your16charapp
MAIL_FROM="NeetCode 150 <you@gmail.com>"
```

Also set `SESSION_SECRET` in production; without it a key is generated once into
`backend/data/session.secret`.

What the API does for you: scrypt password hashes, hashed single-use codes with a 10-minute expiry
and a five-attempt limit, HMAC-signed session cookies (HttpOnly, SameSite=Lax) with a server-side row
per session so signing out really revokes the token, a same-origin check on mutations, and per-IP rate
limits on sign-up, sign-in and code requests.

## What is in the app

**Today (home).** A greeting, the day's state, and Gruv — a cat who is fed by solving. He sleeps
before the first problem, waits while a streak is alive but today is empty, purrs on a three-day run,
and droops when a run lapses. Beside him: the streak ledger (current run, longest run, active days,
28-day consistency, mastered count) and the account state.

**Tracker.** Twelve week dropdowns, day-wise groups inside each week, and every problem with a
checkbox, its difficulty, and Problem / Free / Video links. Checking the box dates it and starts the
Day 3 → Day 7 → Day 30 clock; each stage has its own Done/Redo pair with its due date. Notes hold the
sheet's Time/Space, Pattern and Trigger columns. Filters: search, difficulty, and status.

**Progress.** A wall of 150 squares in study order, per-week bars, the next fourteen days of
re-solves, and the difficulty mix.

**Streak board.** Ranked by current streak (also by longest run and by mastery), with a bar per
person, a mark for who has logged today, and your own row highlighted. Names only — never emails.

**Daily heatmap.** Twenty-six weeks of activity, Monday-first so it lines up with the plan weeks,
coloured by how much was logged that day.

**Method.** The sheet's own words: the rule, the six-step loop, how to fill it in, the daily routine
and the twelve-week plan with dates.

### How a streak is counted

A day counts once you solve or re-solve at least one problem. The run survives the whole of today —
it only breaks when yesterday and today are both empty. First solves, Day 3, Day 7 and Day 30
re-solves all count, because a re-solve day is still a study day.

## Checks

```bash
npm test                                        # everything below
npm --prefix backend test                       # 70 API checks against a real SQLite file
npm --prefix frontend run verify                # 196 checks: logic, SSR markup, DOM, full stack
npm --prefix frontend run typecheck
```

`frontend/scripts/verify.sh` runs three suites, each bundled through Vite's SSR pipeline:

- `verify.tsx` — data integrity (150 problems, week counts, links), the re-solve state machine,
  streak and heatmap maths, the local/remote merge, and the server-rendered markup of every view.
- `interaction.tsx` — a real DOM with no API at all: check a problem off, mark a re-solve, and watch
  the pet, the ledger and the heatmap follow; a missed re-solve raises the banner and filters.
- `account.tsx` — the whole stack: it starts the actual API on a throwaway database and drives
  sign-up, the emailed code, progress upload, the leaderboard, sign-out and sign-in through the UI.

## Data

`data/tracker-rows.json` is the sheet export (with the cell hyperlinks, which a CSV export drops).
`npm run gen-data` regenerates `frontend/src/data/problems.ts` from it, including the day-wise pacing
each week. `data/all_sheets.txt` holds all three sheets verbatim for reference.

## Notes and limits

- The day-wise pacing inside a week is a suggestion; the sheet has no day column.
- Progress syncs as one document per account (last write wins), merged per problem so the further
  record always survives. Conflicts are resolved in the user's favour, never by discarding work.
- There is no password reset flow yet; a forgotten password means re-registering that address.
- Rate limits and streaks are computed in-process, which suits a single instance.
