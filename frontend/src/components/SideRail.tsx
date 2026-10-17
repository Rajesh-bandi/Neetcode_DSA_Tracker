import { WEEKS, TOTAL } from '../data/problems';
import { STATUS_LABEL, type Tracker } from '../lib/state';
import { useAuth } from '../lib/auth';
import type { SyncHandle } from '../lib/sync';

export type View = 'home' | 'tracker' | 'progress' | 'leaderboard' | 'method' | 'settings' | 'login';

const NAV: { id: View; label: string }[] = [
  { id: 'home', label: 'Today' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'progress', label: 'Progress' },
  { id: 'leaderboard', label: 'Streak board' },
  { id: 'method', label: 'Method' },
  { id: 'settings', label: 'Settings' },
];

type Props = {
  view: View;
  onView: (v: View) => void;
  tracker: Tracker;
  sync: SyncHandle;
  onJumpToWeek: (week: number) => void;
};

export function SideRail({ view, onView, tracker, sync, onJumpToWeek }: Props) {
  const { user, logout, logoutEverywhere } = useAuth();
  const { solvedCount, masteredCount, dueNow, redo, planPosition, streak } = tracker;

  const counts: Record<View, string> = {
    home: `${streak.current}d run`,
    tracker: `${solvedCount}/${TOTAL}`,
    progress: `${masteredCount} mastered`,
    leaderboard: user ? 'ranked' : 'sign in',
    method: '12 weeks',
    settings: user ? 'account' : 'local data',
    login: '',
  };

  return (
    <aside className="rail">
      <div className="rail__brand">
        <span className="rail__mark">NeetCode 150</span>
        <span className="rail__sub">twelve weeks, three re-solves</span>
      </div>

      <nav className="rail__nav" aria-label="Sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className="navitem"
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onView(item.id)}
          >
            <span className="navitem__mark" aria-hidden="true" />
            {item.label}
            <span className="navitem__count">{counts[item.id]}</span>
          </button>
        ))}
      </nav>

      <div className="rail__foot">
        <div>
          <div className="label" style={{ marginBottom: '0.4rem' }}>
            {planPosition ? `Week ${planPosition.week} · day ${planPosition.day}` : 'Plan starts later'}
          </div>
          <div className="rail__weeks">
            {WEEKS.map((w) => {
              const items = tracker.derived.filter((d) => d.problem.week === w.week);
              const done = items.filter((i) => i.status === 'mastered').length;
              const started = items.filter((i) => i.entry).length;
              const state = done === items.length ? 'done' : started > 0 ? 'partial' : 'new';
              return (
                <button
                  key={w.week}
                  type="button"
                  className="rail__tick"
                  data-state={state}
                  data-current={planPosition?.week === w.week}
                  title={`Week ${w.week}: ${w.topics.join(' + ')} — ${started}/${items.length} solved, ${done} mastered`}
                  aria-label={`Jump to week ${w.week}`}
                  onClick={() => onJumpToWeek(w.week)}
                />
              );
            })}
          </div>
        </div>

        <div className="rail__stat">
          <span>{STATUS_LABEL.due}</span>
          <span style={{ color: dueNow.length ? 'var(--orange)' : undefined }}>{dueNow.length}</span>
        </div>
        <div className="rail__stat">
          <span>{STATUS_LABEL.redo}</span>
          <span style={{ color: redo.length ? 'var(--red)' : undefined }}>{redo.length}</span>
        </div>

        <div className="rail__account">
          {user ? (
            <>
              <span className="rail__who">
                <span className="who__initials small">{(user.name[0] ?? '?').toUpperCase()}</span>
                <span className="rail__whoName">
                  {user.name}
                  <span className="rail__whoMeta" data-state={sync.status}>
                    {sync.status === 'saving'
                      ? 'saving…'
                      : sync.status === 'error'
                        ? 'not syncing'
                        : sync.status === 'loading'
                          ? 'loading…'
                          : 'synced'}
                  </span>
                </span>
              </span>
              <span className="rail__signoutrow">
                <button type="button" className="rail__reset" onClick={() => void logout()}>
                  Sign out
                </button>
                <button
                  type="button"
                  className="rail__reset rail__reset--quiet"
                  title="Sign out on every device that is signed in"
                  onClick={() => void logoutEverywhere()}
                >
                  all devices
                </button>
              </span>
            </>
          ) : (
            <button type="button" className="rail__signin" onClick={() => onView('login')}>
              Sign in to sync
            </button>
          )}
        </div>

      </div>
    </aside>
  );
}
