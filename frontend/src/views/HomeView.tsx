import { useMemo } from 'react';
import { TOTAL, WEEKS } from '../data/problems';
import { longDate, shortDate, type Tracker } from '../lib/state';
import { consistency, shiftDay } from '../lib/streak';
import { MOOD_COPY, Pet, type Mood } from '../components/Pet';
import { Heatmap } from '../components/Heatmap';
import { useAuth } from '../lib/auth';
import { useLeaderboard } from '../lib/useLeaderboard';
import type { SyncHandle } from '../lib/sync';

function greeting(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const MOOD_WORD: Record<Mood, string> = {
  radiant: 'purring',
  content: 'content',
  waiting: 'waiting',
  droopy: 'droopy',
  asleep: 'asleep',
};

type Props = {
  tracker: Tracker;
  sync: SyncHandle;
  onOpenDue: () => void;
  onOpenTracker: () => void;
  onOpenWeek: (week: number) => void;
  onOpenLeaderboard: () => void;
  onSignIn: () => void;
};

export function HomeView({ tracker, sync, onOpenDue, onOpenTracker, onOpenWeek, onOpenLeaderboard, onSignIn }: Props) {
  const { user, streak: accountStreak } = useAuth();
  const { today, activeDays, streak, derived, solvedCount, masteredCount, dueNow, planPosition } = tracker;
  const board = useLeaderboard(Boolean(user), today);

  // Problems logged today — the tally counts re-solve marks too, so it would
  // keep the pet fed after a solve is unchecked.
  const fed = useMemo(() => derived.filter((d) => d.solvedOn === today).length, [derived, today]);
  // Mood reads today's work first: two problems in and he is purring, one and
  // he is content, none and he drops back to whatever the run deserves. The
  // streak only ever shades the idle states — the board, not the pet, ranks
  // people by streak.
  const mood: Mood = useMemo(() => {
    if (fed >= 2) return 'radiant';
    if (fed === 1) return streak.current >= 3 ? 'radiant' : 'content';
    if (streak.current > 0) return 'waiting';
    if (streak.longest > 0) return 'droopy';
    return 'asleep';
  }, [fed, streak.current, streak.longest]);

  const cadence = consistency(activeDays, today, 28);
  const yesterday = shiftDay(today, -1);
  const solvedYesterday = useMemo(
    () => derived.filter((d) => d.solvedOn === yesterday).length,
    [derived, yesterday],
  );
  const nextUp = useMemo(() => derived.find((d) => !d.entry) ?? null, [derived]);
  const name = user?.name?.split(' ')[0] ?? 'there';
  const hour = new Date().getHours();

  return (
    <div className="wrap">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">
            {greeting(hour)}, {name}.
          </h1>
          <span className="pagehead__pulse">
            <span className="dot" data-tone={dueNow.length ? 'due' : fed > 0 ? 'ok' : 'ok'} />
            {planPosition ? (
              <>
                Week {planPosition.week}, day {planPosition.day} · {solvedCount}/{TOTAL} solved
              </>
            ) : (
              <>
                {WEEKS.length} weeks · {solvedCount}/{TOTAL} solved
              </>
            )}
            {dueNow.length > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--orange)' }}>
                  {dueNow.length} re-solve{dueNow.length === 1 ? '' : 's'} due
                </span>
              </>
            )}
          </span>
        </div>
        <p className="prose" style={{ maxWidth: '58ch' }}>
          {longDate(today)}. {fed > 0 ? 'Today is logged.' : 'Nothing logged today yet.'}{' '}
          {dueNow.length > 0
            ? `${dueNow.length} re-solve${dueNow.length === 1 ? '' : 's'} waiting.`
            : 'No re-solves are due.'}
        </p>
      </header>

      <div className="home">
        <section className="panel panel--pet">
          <div className="panel__head">
            <h2 className="h2">Gruv</h2>
            <span className="panel__aside">{MOOD_WORD[mood]}</span>
          </div>

          <div className="petstage">
            <div className="petstage__draw">
              <Pet mood={mood} fed={fed} />
            </div>

            <div className="petstage__side">
              <p className="pet__line" style={{ color: MOOD_COPY[mood].tone }}>
                {MOOD_COPY[mood].line}
              </p>

              <div className="feed" aria-label="Today's feeding">
                <span className="label">today</span>
                <span className="feed__dots" aria-hidden="true">
                  {Array.from({ length: Math.min(fed, 3) }, (_, i) => (
                    <i key={i} data-on />
                  ))}
                </span>
                <span className="feed__n">{fed === 0 ? '0 problems' : `${fed} problem${fed === 1 ? '' : 's'}`}</span>
              </div>

              <div className="petstage__actions">
                <button type="button" className="btn btn--go" onClick={onOpenDue}>
                  {dueNow.length > 0 ? `Open ${dueNow.length} due` : "Open today's queue"}
                </button>
                {nextUp && (
                  <button type="button" className="btn btn--quiet" onClick={() => onOpenWeek(nextUp.problem.week)}>
                    Next: LC {nextUp.problem.lc}
                  </button>
                )}
              </div>

              <p className="pet__hint">
                {solvedYesterday > 0
                  ? `${solvedYesterday} solved yesterday.`
                  : 'A problem a day keeps the run alive.'}
              </p>
            </div>
          </div>
        </section>

        <aside className="panel ledger">
          <div className="ledger__lead">
            <span className="ledger__v" data-tone={streak.current > 0 ? 'ok' : undefined}>
              {streak.current}
            </span>
            <span className="ledger__k">day streak</span>
            <span className="ledger__flag">{streak.activeToday ? 'logged today' : 'today still open'}</span>
          </div>

          <dl className="ledger__rows">
            <div>
              <dt>Longest run</dt>
              <dd>{streak.longest}</dd>
            </div>
            <div>
              <dt>Active days</dt>
              <dd>{streak.totalDays}</dd>
            </div>
            <div>
              <dt>Mastered</dt>
              <dd>
                {masteredCount}
                <span className="ledger__of">/{TOTAL}</span>
              </dd>
            </div>
            <div>
              <dt>Last 28 days</dt>
              <dd>{cadence}%</dd>
            </div>
          </dl>

          <div className="cadence" aria-hidden="true">
            <span style={{ width: `${cadence}%` }} />
          </div>

          <div className="ledger__account">
            {user ? (
              <>
                <span className="who">
                  <span className="who__initials">{(user.name[0] ?? '?').toUpperCase()}</span>
                  <span>
                    <span className="who__name">{user.name}</span>
                    <span className="who__meta">
                      {sync.status === 'saving'
                        ? 'saving to your account…'
                        : sync.status === 'error'
                          ? sync.error ?? 'sync paused'
                          : sync.status === 'loading'
                            ? 'loading your account…'
                            : 'synced'}
                    </span>
                  </span>
                </span>
                {sync.status === 'error' && (
                  <button type="button" className="empty__link" onClick={sync.retry}>
                    Retry sync
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="who">
                  <span className="who__initials">?</span>
                  <span>
                    <span className="who__name">Guest</span>
                    <span className="who__meta">streak saved in this browser only</span>
                  </span>
                </span>
                <button type="button" className="empty__link" onClick={onSignIn}>
                  Keep it →
                </button>
              </>
            )}
          </div>

          {accountStreak && user && accountStreak.current !== streak.current && (
            <p className="pet__hint">Account streak: {accountStreak.current} days.</p>
          )}
        </aside>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">The last six months</h2>
          <span className="panel__aside">
            {streak.current} day run · best {streak.longest} · {cadence}% of the last 28 days
          </span>
        </div>
        <Heatmap counts={activeDays} today={today} weeks={26} />
      </section>

      <div className="home__lower">
        <section className="panel">
          <div className="panel__head">
            <h2 className="h2">Due today</h2>
            <span className="panel__aside">
              <button type="button" className="panel__link" onClick={onOpenDue}>
                {dueNow.length > 0 ? `all ${dueNow.length}` : 'open tracker'}
              </button>
            </span>
          </div>
          {dueNow.length === 0 ? (
            <p className="panel__note">
              Nothing is due. {nextUp ? `The next unsolved problem is ${nextUp.problem.title}.` : 'Every problem has a first pass.'}
            </p>
          ) : (
            <ul className="due">
              {dueNow.slice(0, 4).map((item) => (
                <li key={item.problem.id}>
                  <button type="button" className="due__row" onClick={() => onOpenWeek(item.problem.week)}>
                    <span className="due__no">{item.problem.lc}</span>
                    <span className="due__title">{item.problem.title}</span>
                    <span className="due__when">{item.nextDue ? shortDate(item.nextDue) : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--quiet" onClick={onOpenTracker}>
            Open the tracker
          </button>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="h2">Streak board</h2>
            <span className="panel__aside">
              <button type="button" className="panel__link" onClick={onOpenLeaderboard}>
                full board
              </button>
            </span>
          </div>

          {!user ? (
            <p className="panel__note">
              The board is for accounts. <button type="button" className="inline-link" onClick={onSignIn}>Sign in</button> to keep
              your streak across devices and stand next to the other maintainers.
            </p>
          ) : board.loading ? (
            <p className="panel__note">Reading the board…</p>
          ) : board.error ? (
            <p className="panel__note">
              {board.error}{' '}
              <button type="button" className="inline-link" onClick={board.reload}>
                Try again
              </button>
            </p>
          ) : board.entries.length === 0 ? (
            <p className="panel__note">No one has logged a day yet. You could be first.</p>
          ) : (
            <ol className="mini">
              {board.entries.slice(0, 5).map((row) => (
                <li key={row.id} data-you={row.isYou || undefined}>
                  <span className="mini__rank">{row.rank}</span>
                  <span className="mini__name">
                    {row.name}
                    {row.isYou && <span className="mini__you">you</span>}
                  </span>
                  <span className="mini__streak">
                    {row.currentStreak}
                    <span className="mini__unit">d</span>
                  </span>
                  <span className="mini__dot" data-on={row.activeToday} title={row.activeToday ? 'active today' : 'not yet today'} />
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
