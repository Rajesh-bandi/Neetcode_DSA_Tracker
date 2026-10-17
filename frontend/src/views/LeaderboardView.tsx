import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useLeaderboard } from '../lib/useLeaderboard';
import type { LeaderRow } from '../lib/api';
import type { Tracker } from '../lib/state';

type Sort = 'streak' | 'longest' | 'mastered';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'streak', label: 'Current streak' },
  { id: 'longest', label: 'Longest run' },
  { id: 'mastered', label: 'Mastered' },
];

function sortRows(rows: LeaderRow[], sort: Sort): LeaderRow[] {
  const copy = [...rows];
  if (sort === 'streak') return copy.sort((a, b) => b.currentStreak - a.currentStreak || a.name.localeCompare(b.name));
  if (sort === 'longest') return copy.sort((a, b) => b.longestStreak - a.longestStreak || b.solved - a.solved);
  return copy.sort((a, b) => b.mastered - a.mastered || b.solved - a.solved);
}

export function LeaderboardView({ tracker, onSignIn }: { tracker: Tracker; onSignIn: () => void }) {
  const { user } = useAuth();
  const board = useLeaderboard(Boolean(user), tracker.today);
  const [sort, setSort] = useState<Sort>('streak');

  const rows = useMemo(() => sortRows(board.entries, sort), [board.entries, sort]);
  const ceiling = Math.max(1, ...rows.map((r) => r.currentStreak));
  const maintainers = rows.filter((r) => r.currentStreak > 0).length;

  return (
    <div className="wrap">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">Streak board</h1>
          <span className="pagehead__pulse">
            <span className="dot" data-tone={maintainers > 0 ? 'ok' : 'due'} />
            {user ? `${board.total ?? rows.length} on the board · ${maintainers} holding a streak` : 'accounts only'}
          </span>
        </div>
        <p className="prose" style={{ maxWidth: '60ch' }}>
          A streak is a day with at least one problem solved or re-solved. Ties break on the longest run, then on
          problems mastered. Nothing here resets anyone&rsquo;s work — falling off only drops you down the list.
        </p>
      </header>

      {!user ? (
        <div className="empty">
          <span className="h2">The board opens with an account</span>
          <p className="panel__note" style={{ maxWidth: '46ch' }}>
            Your streak is already being kept in this browser. Creating an account puts it on the server, so it
            survives a cleared cache and shows up next to the other maintainers.
          </p>
          <button type="button" className="btn btn--go" onClick={onSignIn}>
            Create an account
          </button>
        </div>
      ) : (
        <>
          <div className="filters">
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="chip"
                aria-pressed={sort === option.id}
                onClick={() => setSort(option.id)}
              >
                {option.label}
              </button>
            ))}
            <button type="button" className="chip" onClick={board.reload} disabled={board.loading}>
              {board.loading ? 'Reading…' : 'Refresh'}
            </button>
          </div>

          {board.error && <p className="panel__note">{board.error}</p>}

          {rows.length === 0 && !board.loading ? (
            <div className="empty">
              <span className="h2">Nobody has logged a day yet</span>
              <p className="panel__note">Solve one problem in the tracker and the first row is yours.</p>
            </div>
          ) : (
            <section className="panel">
              <div className="panel__head">
                <h2 className="h2">Ranked by {SORTS.find((s) => s.id === sort)?.label.toLowerCase()}</h2>
                <span className="panel__aside">top {Math.min(rows.length, 50)}</span>
              </div>

              <ol className="lb">
                {rows.map((row) => (
                  <li key={row.id} className="lb__row" data-you={row.isYou || undefined}>
                    <span className="lb__rank">{row.rank}</span>
                    <span className="lb__who">
                      <span className="lb__initials">{row.initials}</span>
                      <span className="lb__name">
                        {row.name}
                        {row.isYou && <span className="mini__you">you</span>}
                      </span>
                    </span>
                    <span className="lb__bar" aria-hidden="true">
                      <span
                        className="lb__barfill"
                        style={{ width: `${Math.round((row.currentStreak / ceiling) * 100)}%` }}
                        data-active={row.activeToday || undefined}
                      />
                    </span>
                    <span className="lb__nums">
                      <span className="lb__streak">
                        {row.currentStreak}
                        <span className="mini__unit">d</span>
                      </span>
                      <span className="lb__meta">
                        best {row.longestStreak} · {row.solved} solved · {row.mastered} mastered · {row.activeDays} days
                      </span>
                    </span>
                    <span className="mini__dot" data-on={row.activeToday} title={row.activeToday ? 'active today' : 'not yet today'} />
                  </li>
                ))}
              </ol>

              {board.you && !rows.some((r) => r.isYou) && (
                <p className="panel__note">
                  You sit at rank {board.you.rank} with a {board.you.currentStreak}-day streak.
                </p>
              )}
            </section>
          )}

        </>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">How the run is counted</h2>
          <span className="panel__aside">today · {tracker.today}</span>
        </div>
        <ul className="rules rules--tight">
          <li>A day counts once you solve or re-solve at least one problem.</li>
          <li>The run stays alive through today: it only breaks if yesterday and today are both empty.</li>
          <li>First solves, Day 3, Day 7 and Day 30 re-solves all count — a re-solve day is still a study day.</li>
          <li>Your own row is the one marked &ldquo;you&rdquo;. Names come from your sign-up, never your email.</li>
        </ul>
      </section>
    </div>
  );
}
