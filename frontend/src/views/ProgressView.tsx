import { useMemo, useState } from 'react';
import { TOTAL, WEEKS } from '../data/problems';
import {
  STAGES,
  STAGE_LABEL,
  STATUS_LABEL,
  addDays,
  daysBetween,
  longDate,
  shortDate,
  type Derived,
  type Stage,
  type Tracker,
} from '../lib/state';

const STAGE_COLOR: Record<Stage, string> = {
  day3: 'var(--aqua)',
  day7: 'var(--yellow)',
  day30: 'var(--purple)',
};

const STAGE_SHORT: Record<Stage, string> = { day3: 'D3', day7: 'D7', day30: 'D30' };

type Props = { tracker: Tracker; onOpenProblem: (item: Derived) => void };

export function ProgressView({ tracker, onOpenProblem }: Props) {
  const { derived, today, solvedCount, masteredCount, dueNow, redo } = tracker;
  const [readout, setReadout] = useState<Derived | null>(null);

  const reSolvesLogged = derived.reduce((sum, d) => {
    if (!d.entry) return sum;
    return sum + STAGES.filter((s) => d.entry?.marks[s] === 'done').length;
  }, 0);

  const perWeek = WEEKS.map((w) => {
    const items = derived.filter((d) => d.problem.week === w.week);
    return {
      ...w,
      started: items.filter((i) => i.entry).length,
      mastered: items.filter((i) => i.status === 'mastered').length,
    };
  });

  // Next 14 days of scheduled re-solves; anything overdue piles onto today.
  const timeline = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    return days.map((date) => {
      const bits: { stage: Stage; overdue: boolean; title: string }[] = [];
      for (const d of derived) {
        if (!d.entry || !d.nextStage || !d.nextDue) continue;
        const offset = daysBetween(today, d.nextDue);
        if (offset < 0) {
          if (date === today) {
            bits.push({ stage: d.nextStage, overdue: true, title: d.problem.title });
          }
        } else if (offset === daysBetween(today, date)) {
          bits.push({ stage: d.nextStage, overdue: false, title: d.problem.title });
        }
      }
      return { date, bits };
    });
  }, [derived, today]);

  const timelineTotal = timeline.reduce((s, d) => s + d.bits.length, 0);
  const busiest = Math.max(1, ...timeline.map((d) => d.bits.length));

  const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 100));

  return (
    <div className="wrap">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">Progress</h1>
          <span className="pagehead__pulse">
            <span className="dot" data-tone={dueNow.length ? 'due' : masteredCount ? 'ok' : 'ok'} />
            {solvedCount} of {TOTAL} solved · {pct(masteredCount, TOTAL)}% mastered
          </span>
        </div>
        <p className="prose" style={{ maxWidth: '60ch' }}>
          Every square below is one problem. It fills in as you solve and re-solve, so the wall is a
          running record of what you can still recall on a blank page.
        </p>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="stat__v">
            {solvedCount}
            <span style={{ color: 'var(--fg-faint)', fontSize: '0.8rem' }}>/{TOTAL}</span>
          </span>
          <span className="stat__k">First solved</span>
        </div>
        <div className="stat">
          <span className="stat__v" data-tone="ok">
            {masteredCount}
          </span>
          <span className="stat__k">Mastered (Day 30)</span>
        </div>
        <div className="stat">
          <span className="stat__v" data-tone="due">
            {dueNow.length}
          </span>
          <span className="stat__k">{STATUS_LABEL.due}</span>
        </div>
        <div className="stat">
          <span className="stat__v" data-tone="redo">
            {redo.length}
          </span>
          <span className="stat__k">{STATUS_LABEL.redo}</span>
        </div>
        <div className="stat">
          <span className="stat__v">{reSolvesLogged}</span>
          <span className="stat__k">Re-solves logged</span>
        </div>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">The wall</h2>
          <span className="panel__aside">
            {masteredCount === 0
              ? 'nothing re-solved yet'
              : `${masteredCount} solid · ${solvedCount - masteredCount} in progress`}
          </span>
        </div>

        <div className="wall">
          {perWeek.map((w) => {
            const items = derived.filter((d) => d.problem.week === w.week);
            return (
              <div className="wallrow" key={w.week}>
                <span className="wallrow__label">{w.week}</span>
                <div className="wallrow__cells">
                  {items.map((item, i) => {
                    const label =
                      `LC ${item.problem.lc} ${item.problem.title}, week ${w.week}, ` +
                      `${item.problem.difficulty}, ${STATUS_LABEL[item.status]}` +
                      (item.nextDue && item.nextStage
                        ? `, ${STAGE_LABEL[item.nextStage]} due ${shortDate(item.nextDue)}`
                        : '');
                    return (
                      <button
                        key={item.problem.id}
                        type="button"
                        className="wall__cell"
                        data-f={item.furthest}
                        data-status={item.status === 'due' ? 'due' : item.status === 'redo' ? 'redo' : undefined}
                        data-lead={i === 0}
                        aria-label={label}
                        onMouseEnter={() => setReadout(item)}
                        onMouseLeave={() => setReadout(null)}
                        onFocus={() => setReadout(item)}
                        onBlur={() => setReadout(null)}
                        onClick={() => onOpenProblem(item)}
                      />
                    );
                  })}
                  {Array.from({ length: 15 - items.length }, (_, i) => (
                    <span key={`gap-${i}`} className="wall__gap" aria-hidden="true" />
                  ))}
                </div>
                <span className="wallrow__count">{`${w.started}/${w.count}`}</span>
              </div>
            );
          })}
        </div>

        <div className="wall__readout" aria-live="polite">
          {readout ? (
            <>
              <b>{readout.problem.title}</b>
              <span>LC {readout.problem.lc}</span>
              <span>{readout.problem.topic}</span>
              <span>{STATUS_LABEL[readout.status]}</span>
              {readout.nextDue && readout.nextStage && (
                <span style={{ color: STAGE_COLOR[readout.nextStage] }}>
                  {STAGE_LABEL[readout.nextStage]} due {shortDate(readout.nextDue)}
                </span>
              )}
            </>
          ) : (
            <span>
              Rows are weeks, squares are problems in study order. Hover a square for details, click to
              open it in the tracker. Empty squares are the slack built into the later weeks.
            </span>
          )}
        </div>

        <div className="legend">
          <span>
            <span className="swatch" style={{ background: 'var(--bg-soft)', border: '1px solid var(--surface)' }} />
            not started
          </span>
          <span>
            <span className="swatch" style={{ background: 'rgba(142,192,124,0.22)' }} />
            Day 1 solved
          </span>
          <span>
            <span className="swatch" style={{ background: 'rgba(142,192,124,0.55)' }} />
            Day 3 / Day 7 done
          </span>
          <span>
            <span className="swatch" style={{ background: 'var(--aqua)' }} />
            {STATUS_LABEL.mastered}
          </span>
          <span>
            <span className="swatch" style={{ background: 'var(--orange)' }} />
            due now
          </span>
          <span>
            <span className="swatch" style={{ background: 'rgba(251,73,52,0.35)' }} />
            redo
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">Week by week</h2>
          <span className="panel__aside">started against mastered</span>
        </div>
        <div className="bars">
          {perWeek.map((w) => (
            <div className="bar" key={w.week}>
              <span className="bar__label">wk {w.week}</span>
              <span className="bar__track" title={`${w.topics.join(' + ')} — ${w.started}/${w.count} solved, ${w.mastered} mastered`}>
                <span className="bar__started" style={{ width: `${pct(w.started, w.count)}%` }} />
                <span className="bar__mastered" style={{ width: `${pct(w.mastered, w.count)}%` }} />
              </span>
              <span className="bar__pct">
                {w.mastered}/{w.count}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">The next fourteen days</h2>
          <span className="panel__aside">
            {timelineTotal === 0
              ? 'no re-solves scheduled'
              : `${timelineTotal} re-solve${timelineTotal === 1 ? '' : 's'} scheduled`}
          </span>
        </div>
        {timelineTotal === 0 ? (
          <p className="panel__note">
            Nothing is scheduled yet. Solve a problem in the tracker and its Day 3, Day 7 and Day 30
            re-solves appear here on the day they are due.
          </p>
        ) : (
          <div className="timeline">
            {timeline.map((d) => (
              <div className="tl" key={d.date}>
                <span className="tl__n">{d.bits.length || ''}</span>
                <span className="tl__stack">
                  {d.bits.map((b, i) => (
                    <span
                      key={`${b.title}-${i}`}
                      className="tl__bit"
                      style={{ background: b.overdue ? 'var(--red)' : STAGE_COLOR[b.stage], opacity: 0.85 }}
                      title={`${b.title} · ${STAGE_SHORT[b.stage]}${b.overdue ? ' overdue' : ''}`}
                    />
                  ))}
                </span>
                <span className="tl__day" data-today={d.date === today}>
                  {d.date === today ? 'today' : `${d.date.slice(8)}/${d.date.slice(5, 7)}`}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="legend">
          {STAGES.map((s) => (
            <span key={s}>
              <span className="swatch" style={{ background: STAGE_COLOR[s] }} />
              {STAGE_LABEL[s]} re-solve
            </span>
          ))}
          <span>
            <span className="swatch" style={{ background: 'var(--red)' }} />
            overdue
          </span>
          <span style={{ marginLeft: 'auto' }}>busiest day: {busiest}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">Difficulty mix</h2>
          <span className="panel__aside">
            28 easy · 101 medium · 21 hard across {WEEKS.length} weeks
          </span>
        </div>
        <div className="split">
          {(['Easy', 'Medium', 'Hard'] as const).map((d) => {
            const n = derived.filter((x) => x.problem.difficulty === d).length;
            return (
              <span
                key={d}
                style={{
                  width: `${pct(n, TOTAL)}%`,
                  background: d === 'Easy' ? 'var(--green)' : d === 'Medium' ? 'var(--yellow)' : 'var(--red)',
                }}
                title={`${n} ${d}`}
              />
            );
          })}
        </div>
        <div className="split__keys">
          <span style={{ color: 'var(--green)' }}>
            Easy {derived.filter((x) => x.problem.difficulty === 'Easy' && x.entry).length}/
            {derived.filter((x) => x.problem.difficulty === 'Easy').length}
          </span>
          <span style={{ color: 'var(--yellow)' }}>
            Medium {derived.filter((x) => x.problem.difficulty === 'Medium' && x.entry).length}/
            {derived.filter((x) => x.problem.difficulty === 'Medium').length}
          </span>
          <span style={{ color: 'var(--red)' }}>
            Hard {derived.filter((x) => x.problem.difficulty === 'Hard' && x.entry).length}/
            {derived.filter((x) => x.problem.difficulty === 'Hard').length}
          </span>
          <span style={{ marginLeft: 'auto' }}>Today · {longDate(today)}</span>
        </div>
      </section>
    </div>
  );
}
