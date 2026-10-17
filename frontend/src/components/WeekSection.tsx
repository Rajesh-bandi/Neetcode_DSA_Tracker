import { shortDate, type Derived, type Tracker } from '../lib/state';
import type { WeekMeta } from '../data/problems';
import { ProblemRow } from './ProblemRow';

type Props = {
  meta: WeekMeta;
  items: Derived[];
  /** Subset to render when a filter is active; counts still use every item. */
  shown?: Derived[];
  tracker: Tracker;
  open: boolean;
  onToggle: () => void;
  /** True when the current plan position falls inside this week. */
  current: boolean;
  flashId: string | null;
};

export function WeekSection({ meta, items, shown, tracker, open, onToggle, current, flashId }: Props) {
  const solved = items.filter((i) => i.entry).length;
  const mastered = items.filter((i) => i.status === 'mastered').length;
  const due = items.filter((i) => i.status === 'due').length;
  const allDone = solved === items.length;

  const { start: weekStart, end: weekEnd } = tracker.schedule.weekRange(meta.week);

  const rows = shown ?? items;
  const days = [...new Set(rows.map((i) => i.problem.day))].sort((a, b) => a - b);

  return (
    <section className="week" data-current={current} data-done={allDone}>
      <button
        type="button"
        className="week__head"
        aria-expanded={open}
        aria-controls={`week-${meta.week}-body`}
        onClick={onToggle}
      >
        <span className="week__no">{meta.week}</span>

        <span className="week__title">
          <span className="week__topics">{meta.topics.join(' + ')}</span>
          <span className="week__meta">
            <span>
              {shortDate(weekStart)} – {shortDate(weekEnd)}
            </span>
            <span className="week__strip" aria-hidden="true">
              {items.map((i) => (
                <span
                  key={i.problem.id}
                  className="week__seg"
                  data-s={i.status === 'redo' || i.status === 'due' ? (i.status === 'redo' ? 'r' : '2') : String(i.furthest)}
                />
              ))}
            </span>
          </span>
        </span>

        <span className="week__right">
          {due > 0 && <span style={{ color: 'var(--orange)' }}>{due} due</span>}
          <span className="week__ratio">
            {solved}/{items.length}
          </span>
          {mastered > 0 && <span style={{ color: 'var(--aqua)' }}>{mastered} mastered</span>}
          <span className="chev" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="week__body" id={`week-${meta.week}-body`}>
          {days.map((day) => {
            const dayItems = rows.filter((i) => i.problem.day === day);
            const date = tracker.schedule.dateFor(meta.week, day);
            return (
              <div className="daygroup" key={day}>
                <div className="daygroup__head">
                  <span className="daygroup__day">Day {day}</span>
                  <span className="daygroup__date">
                    {shortDate(date)} · {dayItems.length}{' '}
                    {dayItems.length === 1 ? 'problem' : 'problems'}
                  </span>
                  <span className="daygroup__count">
                    {dayItems.filter((i) => i.entry).length} solved
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {dayItems.map((item, idx) => (
                    <ProblemRow
                      key={item.problem.id}
                      item={item}
                      tracker={tracker}
                      showTopic={idx === 0 || dayItems[idx - 1].problem.topic !== item.problem.topic}
                      flash={flashId === item.problem.id}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
