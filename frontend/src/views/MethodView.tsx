import { CREDIT, DAILY_ROUTINE, HOW_TO_FILL, LOOP, PLAN_NOTE, RULE, SUMMARY, WEEK_PLAN } from '../data/method';
import { shortDate, type Tracker } from '../lib/state';

type Props = { tracker: Tracker };

export function MethodView({ tracker }: Props) {
  const { planPosition } = tracker;
  const planStart = tracker.store.planStart;

  return (
    <div className="wrap">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">Method</h1>
          <span className="pagehead__pulse">
            <span className="dot" data-tone="ok" />
            {SUMMARY.total} problems · {SUMMARY.weeks} weeks · {SUMMARY.reSolves} re-solves each
          </span>
        </div>
        <blockquote className="quote">{RULE}</blockquote>
      </header>

      <section className="panel" style={{ gap: '1.2rem' }}>
        <div className="panel__head">
          <h2 className="h2">The six-step loop</h2>
          <span className="panel__aside">do this for every problem</span>
        </div>
        <div className="method">
          {LOOP.map((s) => (
            <article className="loopstep" key={s.step}>
              <span className="loopstep__n">step {s.step}</span>
              <h3 className="loopstep__t">{s.title}</h3>
              <p className="loopstep__b">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="method" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="loopstep" style={{ gap: '0.8rem' }}>
          <h2 className="h2">How to fill it in</h2>
          <ul className="rules">
            {HOW_TO_FILL.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="loopstep" style={{ gap: '0.8rem' }}>
          <h2 className="h2">Daily routine</h2>
          <ul className="rules">
            {DAILY_ROUTINE.map((r) => (
              <li key={r.body}>
                <span style={{ color: 'var(--aqua)' }}>{r.minutes}</span> {r.body}
              </li>
            ))}
          </ul>
          <p className="loopstep__b" style={{ marginTop: 'auto' }}>
            Two to three hours a day. The re-solve block is the part people skip, and it is the part
            that makes the problem yours.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2 className="h2">The twelve weeks</h2>
          <label className="panel__aside" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            week 1 starts
            <input
              className="dateinput"
              type="date"
              value={planStart}
              onChange={(e) => e.target.value && tracker.setPlanStart(e.target.value)}
            />
          </label>
        </div>
        <div className="plan">
          {WEEK_PLAN.map((w) => {
            const range = tracker.schedule.weekRange(w.week);
            return (
              <div className="planrow" key={w.week} data-now={planPosition?.week === w.week}>
                <span className="planrow__no">{w.week}</span>
                <span className="planrow__label">
                  {w.label}
                  <br />
                  <span style={{ fontSize: '0.78rem', color: 'var(--fg-faint)' }}>
                    {shortDate(range.start)} – {shortDate(range.end)}
                  </span>
                </span>
                <span className="planrow__count">{w.count} problems</span>
              </div>
            );
          })}
        </div>
        <p className="panel__note">{PLAN_NOTE}</p>
      </section>

      <section className="panel" style={{ gap: '0.7rem' }}>
        <h2 className="h2">Where this comes from</h2>
        <p className="panel__note">
          Problem list: {CREDIT.problemList}, arranged into twelve weeks by {CREDIT.author} (
          {CREDIT.handle}). {CREDIT.note} The tracker, the day-slot pacing and the progress view here are
          built from that spreadsheet — Time/Space, pattern and trigger line are yours to write.
        </p>
        <div className="legend">
          <span>
            {SUMMARY.easy} easy · {SUMMARY.medium} medium · {SUMMARY.hard} hard
          </span>
          <span style={{ marginLeft: 'auto' }}>
            Everything is stored in this browser only
          </span>
        </div>
      </section>
    </div>
  );
}
