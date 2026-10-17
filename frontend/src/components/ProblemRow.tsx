import { useState } from 'react';
import { STAGES, STAGE_LABEL, shortDate, STATUS_LABEL, daysBetween, type Derived, type Stage, type Tracker } from '../lib/state';
import { IconExternal, IconFree, IconNote, IconVideo } from './icons';

type Props = {
  item: Derived;
  tracker: Tracker;
  showTopic: boolean;
  flash: boolean;
};

function StageControl({
  item,
  stage,
  tracker,
}: {
  item: Derived;
  stage: Stage;
  tracker: Tracker;
}) {
  const mark = item.entry?.marks[stage];
  const due = item.due[stage];
  const overdue = !mark && daysBetween(tracker.today, due) <= 0;

  return (
    <span className="stage" data-tone={overdue ? 'due' : mark ? mark : 'idle'}>
      <span className="stage__label">{STAGE_LABEL[stage]}</span>
      <span className="stage__due">{shortDate(due)}</span>
      <span className="mark">
        <button
          type="button"
          data-mark="done"
          aria-pressed={mark === 'done'}
          aria-label={`${STAGE_LABEL[stage]} done for ${item.problem.title}`}
          onClick={() => tracker.setMark(item.problem.id, stage, 'done')}
        >
          Done
        </button>
        <button
          type="button"
          data-mark="redo"
          aria-pressed={mark === 'redo'}
          aria-label={`${STAGE_LABEL[stage]} redo for ${item.problem.title}`}
          onClick={() => tracker.setMark(item.problem.id, stage, 'redo')}
        >
          Redo
        </button>
      </span>
    </span>
  );
}

export function ProblemRow({ item, tracker, showTopic, flash }: Props) {
  const [notesOpen, setNotesOpen] = useState(false);
  const { problem } = item;
  const solved = Boolean(item.entry);
  const notes = item.entry?.notes ?? {};
  const trigger = notes.trigger?.trim();
  const hasNotes = Boolean(notes.timeSpace || notes.pattern || notes.trigger);

  return (
    <li className="prob" id={`prob-${problem.id}`} data-solved={solved} data-flash={flash}>
      <button
        type="button"
        className="check"
        role="checkbox"
        aria-checked={solved}
        data-on={solved}
        aria-label={`Mark ${problem.title} as solved today`}
        onClick={() => tracker.toggleSolved(problem.id)}
      />

      <span className="prob__no">{problem.lc}</span>

      <div className="prob__mid">
        <div className="prob__title">
          <span>{problem.title}</span>
          <span className="prob__diff" data-d={problem.difficulty}>
            {problem.difficulty}
          </span>
          {showTopic && <span className="prob__topic">{problem.topic}</span>}
        </div>

        <div className="prob__status">
          {solved ? (
            <>
              <span className="badge" data-tone={item.status === 'due' ? 'due' : item.status === 'redo' ? 'redo' : item.status === 'mastered' ? 'mastered' : 'progress'}>
                {STATUS_LABEL[item.status]}
              </span>
              <span>Day 1 · {shortDate(item.solvedOn as string)}</span>
              {STAGES.map((stage) => (
                <StageControl key={stage} item={item} stage={stage} tracker={tracker} />
              ))}
              <button
                type="button"
                className="prob__clear"
                onClick={() => tracker.resetProblem(problem.id)}
              >
                reset
              </button>
            </>
          ) : (
            <span className="badge" data-tone="progress">
              {STATUS_LABEL['not-started']}
            </span>
          )}
        </div>

        {trigger && <p className="prob__note">{trigger}</p>}
      </div>

      <div className="prob__actions">
        <a
          className="icon-link"
          href={problem.problemUrl}
          target="_blank"
          rel="noreferrer"
          title={`Open ${problem.title} on LeetCode`}
        >
          <IconExternal />
          Problem
        </a>
        {problem.freeUrl && (
          <a
            className="icon-link"
            data-kind="free"
            href={problem.freeUrl}
            target="_blank"
            rel="noreferrer"
            title="Free version of this premium problem"
          >
            <IconFree />
            Free
          </a>
        )}
        <a
          className="icon-link"
          data-kind="video"
          href={problem.videoUrl}
          target="_blank"
          rel="noreferrer"
          title="Solution video - watch only after 20 minutes"
        >
          <IconVideo />
          Video
        </a>
        <button
          type="button"
          className="icon-link"
          data-kind="note"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen((v) => !v)}
          title="Time / Space, pattern and trigger line"
        >
          <IconNote />
          {hasNotes ? 'Notes' : 'Add'}
        </button>
      </div>

      {notesOpen && (
        <div className="notes">
          <label>
            <span>Time / Space</span>
            <input
              type="text"
              value={notes.timeSpace ?? ''}
              placeholder="O(n) time, O(1) space, one pass"
              onChange={(e) => tracker.setNote(problem.id, 'timeSpace', e.target.value)}
            />
          </label>
          <label>
            <span>Pattern</span>
            <input
              type="text"
              value={notes.pattern ?? ''}
              placeholder="Two pointers, partition"
              onChange={(e) => tracker.setNote(problem.id, 'pattern', e.target.value)}
            />
          </label>
          <label>
            <span>Trigger line</span>
            <input
              type="text"
              value={notes.trigger ?? ''}
              placeholder="When you see X in a question, think Y"
              onChange={(e) => tracker.setNote(problem.id, 'trigger', e.target.value)}
            />
          </label>
        </div>
      )}
    </li>
  );
}
