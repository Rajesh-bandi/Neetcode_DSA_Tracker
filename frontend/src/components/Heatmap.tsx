import { useState } from 'react';
import { heatmap, level } from '../lib/streak';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const LEVELS: (0 | 1 | 2 | 3 | 4)[] = [0, 1, 2, 3, 4];

const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function readable(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${LONG_MONTHS[m - 1]} ${y}`;
}

/** GitHub-style contribution grid, Monday-first so it lines up with the plan weeks. */
export function Heatmap({ counts, today, weeks = 26 }: { counts: Record<string, number>; today: string; weeks?: number }) {
  const { columns } = heatmap(counts, today, weeks);
  const [hover, setHover] = useState<string | null>(null);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="heat">
      <div className="heat__months" aria-hidden="true">
        {columns.map((column) => (
          <span key={column.key} className="heat__month">
            {column.month ?? ''}
          </span>
        ))}
      </div>

      <div className="heat__body">
        <div className="heat__days" aria-hidden="true">
          {DAY_LABELS.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>

        <div className="heat__grid" role="grid" aria-label={`Study activity, ${weeks} weeks`}>
          {columns.map((column) => (
            <div className="heat__col" role="row" key={column.key}>
              {column.cells.map((cell) => (
                <button
                  key={cell.day}
                  type="button"
                  role="gridcell"
                  className="heat__cell"
                  data-level={cell.level}
                  data-future={cell.future || undefined}
                  data-today={cell.day === today || undefined}
                  aria-label={
                    cell.future
                      ? `${readable(cell.day)}, still to come`
                      : `${readable(cell.day)}: ${cell.count === 0 ? 'nothing logged' : `${cell.count} logged`}`
                  }
                  onMouseEnter={() => setHover(cell.day)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(cell.day)}
                  onBlur={() => setHover(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="heat__foot">
        <span className="heat__readout" aria-live="polite">
          {hover
            ? `${readable(hover)} · ${counts[hover] ? `${counts[hover]} logged` : 'nothing logged'}`
            : `${total} action${total === 1 ? '' : 's'} logged across ${Object.keys(counts).length} day${
                Object.keys(counts).length === 1 ? '' : 's'
              }`}
        </span>
        <span className="heat__legend">
          quiet
          {LEVELS.map((l) => (
            <i key={l} data-level={l} aria-hidden="true" />
          ))}
          busy
        </span>
      </div>
    </div>
  );
}

export { level };
