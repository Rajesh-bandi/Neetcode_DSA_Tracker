import { useEffect, useMemo, useState } from 'react';
import { TOTAL, WEEKS, type Difficulty } from '../data/problems';
import { STATUS_LABEL, type Tracker } from '../lib/state';
import { WeekSection } from '../components/WeekSection';
import { IconSearch } from '../components/icons';

type StatusFilter = 'all' | 'due' | 'redo' | 'unsolved' | 'solved';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'due', label: 'Re-solve due' },
  { id: 'redo', label: 'Redo' },
  { id: 'unsolved', label: 'Not started' },
  { id: 'solved', label: 'Solved' },
];

const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];

type Props = {
  tracker: Tracker;
  openWeeks: Set<number>;
  setOpenWeeks: (update: (prev: Set<number>) => Set<number>) => void;
  flashId: string | null;
  /** Bumped by the home page when it wants the due queue in front. */
  dueRequest?: number;
};

export function TrackerView({ tracker, openWeeks, setOpenWeeks, flashId, dueRequest = 0 }: Props) {
  const [query, setQuery] = useState('');
  const [diffs, setDiffs] = useState<Set<Difficulty>>(new Set());
  const [status, setStatus] = useState<StatusFilter>('all');

  const { today, derived, dueNow, redo, solvedCount, masteredCount, planPosition } = tracker;

  // The home page can push the re-solve queue to the front.
  useEffect(() => {
    if (dueRequest > 0) setStatus('due');
  }, [dueRequest]);

  const filtering = query.trim() !== '' || diffs.size > 0 || status !== 'all';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (d: (typeof derived)[number]) => {
      if (q && !`${d.problem.lc} ${d.problem.title} ${d.problem.topic}`.toLowerCase().includes(q)) {
        return false;
      }
      if (diffs.size > 0 && !diffs.has(d.problem.difficulty)) return false;
      if (status === 'due' && d.status !== 'due') return false;
      if (status === 'redo' && d.status !== 'redo') return false;
      if (status === 'unsolved' && d.entry) return false;
      if (status === 'solved' && !d.entry) return false;
      return true;
    };
  }, [query, diffs, status, derived]);

  const visibleWeeks = useMemo(() => {
    if (!filtering) return WEEKS;
    return WEEKS.filter((w) => derived.some((d) => d.problem.week === w.week && matches(d)));
  }, [filtering, matches, derived]);

  const matchCount = useMemo(() => derived.filter(matches).length, [derived, matches]);

  const toggleWeek = (week: number) => {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) next.delete(week);
      else next.add(week);
      return next;
    });
  };

  const toggleDiff = (d: Difficulty) => {
    setDiffs((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setDiffs(new Set());
    setStatus('all');
  };

  const diffCounts = {
    Easy: derived.filter((d) => d.problem.difficulty === 'Easy').length,
    Medium: derived.filter((d) => d.problem.difficulty === 'Medium').length,
    Hard: derived.filter((d) => d.problem.difficulty === 'Hard').length,
  };

  return (
    <div className="wrap">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">Tracker</h1>
          <span className="pagehead__pulse">
            <span className="dot" data-tone={dueNow.length ? 'due' : redo.length ? 'redo' : 'ok'} />
            {planPosition
              ? `Week ${planPosition.week}, day ${planPosition.day} · ${solvedCount}/${TOTAL} solved · ${masteredCount} mastered`
              : `Plan has not started · ${solvedCount}/${TOTAL} solved`}
          </span>
        </div>
        <p className="prose" style={{ maxWidth: '60ch' }}>
          Check a problem off on the day you first solve it. The Day 3, Day 7 and Day 30 re-solve dates
          are calculated from that date, and today&rsquo;s re-solves are waiting in the queue.
        </p>
      </header>

      {dueNow.length > 0 && (
        <div className="banner">
          <span className="dot" data-tone="due" />
          <span>
            <span className="banner__strong">
              {dueNow.length} {dueNow.length === 1 ? 're-solve is' : 're-solves are'} due today
            </span>{' '}
            — {dueNow.slice(0, 3).map((d) => d.problem.title).join(', ')}
            {dueNow.length > 3 ? ` and ${dueNow.length - 3} more` : ''}
          </span>
          <button
            type="button"
            className="chip"
            data-tone="due"
            onClick={() => {
              setStatus(status === 'due' ? 'all' : 'due');
              setOpenWeeks(() => new Set(dueNow.map((d) => d.problem.week)));
            }}
          >
            {status === 'due' ? 'Show everything' : 'Show them'}
          </button>
        </div>
      )}

      <div className="filters">
        <div className="search">
          <span className="search__icon" aria-hidden="true">
            <IconSearch />
          </span>
          <input
            type="search"
            value={query}
            placeholder="Search by number, name or topic"
            aria-label="Search problems"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {DIFFS.map((d) => (
          <button
            key={d}
            type="button"
            className="chip"
            aria-pressed={diffs.has(d)}
            onClick={() => toggleDiff(d)}
          >
            {d}
            <span className="chip__n">{diffCounts[d]}</span>
          </button>
        ))}

        <span style={{ width: '1px', height: '1.4rem', background: 'var(--surface)' }} />

        {STATUS_FILTERS.map((f) => {
          const n =
            f.id === 'due'
              ? dueNow.length
              : f.id === 'redo'
                ? redo.length
                : f.id === 'unsolved'
                  ? TOTAL - solvedCount
                  : solvedCount;
          return (
            <button
              key={f.id}
              type="button"
              className="chip"
              data-tone={f.id === 'due' ? 'due' : undefined}
              aria-pressed={status === f.id}
              disabled={n === 0}
              style={n === 0 ? { opacity: 0.45, cursor: 'default' } : undefined}
              onClick={() => setStatus(status === f.id ? 'all' : f.id)}
            >
              {f.label}
              <span className="chip__n">{n}</span>
            </button>
          );
        })}

        {filtering && (
          <button type="button" className="chip" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className="legend">
        <span>
          <span className="swatch" style={{ background: 'var(--surface)' }} />
          not started
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--fg-faint)' }} />
          Day 1 solved
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--aqua-dim)' }} />
          re-solving
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--aqua)' }} />
          {STATUS_LABEL.mastered}
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--orange)' }} />
          {STATUS_LABEL.due}
        </span>
        <span>
          <span className="swatch" style={{ background: 'var(--red)' }} />
          {STATUS_LABEL.redo}
        </span>
      </div>

      {filtering && (
        <div className="label">
          {matchCount} {matchCount === 1 ? 'problem matches' : 'problems match'} the current filters
        </div>
      )}

      {visibleWeeks.length === 0 ? (
        <div className="empty">
          <span className="h2">Nothing matches those filters</span>
          <button type="button" className="empty__link" onClick={clearFilters}>
            Clear filters and show all 150 problems
          </button>
        </div>
      ) : (
        <div className="weeks">
          {visibleWeeks.map((w) => {
            const weekItems = derived.filter((d) => d.problem.week === w.week);
            return (
              <WeekSection
                key={w.week}
                meta={w}
                items={weekItems}
                shown={filtering ? weekItems.filter(matches) : undefined}
                tracker={tracker}
                open={filtering || openWeeks.has(w.week)}
                onToggle={() => toggleWeek(w.week)}
                current={planPosition?.week === w.week}
                flashId={flashId}
              />
            );
          })}
        </div>
      )}

      <p className="label" style={{ paddingBottom: '1rem' }}>
        Day slots are the suggested pacing for that week — work them in any order you like. Today is{' '}
        {today}.
      </p>
    </div>
  );
}
