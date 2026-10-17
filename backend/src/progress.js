const STAGES = new Set(['day3', 'day7', 'day30']);
const MARKS = new Set(['done', 'redo']);
const NOTE_FIELDS = new Set(['timeSpace', 'pattern', 'trigger']);

/**
 * The client owns the shape of a problem entry, so the server validates it
 * instead of trusting it: bounded key counts, known stages, short strings.
 */
export function validateProgress(body) {
  const errors = [];
  const entries = body?.entries;
  const activity = body?.activity ?? {};

  if (typeof body?.planStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.planStart)) {
    errors.push('planStart must be YYYY-MM-DD');
  }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    return { errors: ['entries must be an object'] };
  }
  const keys = Object.keys(entries);
  if (keys.length > 400) errors.push('too many entries');

  for (const key of keys) {
    if (!/^[a-z0-9-]{1,40}$/i.test(key)) {
      errors.push(`bad problem id: ${key}`);
      break;
    }
    const entry = entries[key];
    if (!entry || typeof entry !== 'object') {
      errors.push(`entry ${key} must be an object`);
      break;
    }
    if (typeof entry.solvedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.solvedOn)) {
      errors.push(`entry ${key} has a bad solvedOn`);
      break;
    }
    const marks = entry.marks ?? {};
    if (typeof marks !== 'object' || Array.isArray(marks)) {
      errors.push(`entry ${key} has bad marks`);
      break;
    }
    const badMark = Object.entries(marks).find(([stage, mark]) => !STAGES.has(stage) || !MARKS.has(mark));
    if (badMark) {
      errors.push(`entry ${key} has an unknown mark ${badMark[0]}`);
      break;
    }
    if (entry.notes !== undefined) {
      if (!entry.notes || typeof entry.notes !== 'object') {
        errors.push(`entry ${key} has bad notes`);
        break;
      }
      const badNote = Object.entries(entry.notes).find(
        ([field, value]) => !NOTE_FIELDS.has(field) || typeof value !== 'string' || value.length > 500,
      );
      if (badNote) {
        errors.push(`entry ${key} has a bad note ${badNote[0]}`);
        break;
      }
    }
  }

  if (typeof activity !== 'object' || activity === null || Array.isArray(activity)) {
    errors.push('activity must be an object');
  } else {
    const days = Object.entries(activity);
    if (days.length > 500) errors.push('too many activity days');
    for (const [day, count] of days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        errors.push(`bad activity day ${day}`);
        break;
      }
      if (!Number.isInteger(count) || count < 1 || count > 999) {
        errors.push(`bad activity count for ${day}`);
        break;
      }
    }
  }

  return errors.length ? { errors } : { value: { planStart: body.planStart, entries, activity } };
}

export function summarise(entries) {
  let solved = 0;
  let mastered = 0;
  for (const entry of Object.values(entries ?? {})) {
    if (!entry || typeof entry !== 'object') continue;
    solved += 1;
    if (entry.marks?.day30 === 'done') mastered += 1;
  }
  return { solved, mastered };
}
