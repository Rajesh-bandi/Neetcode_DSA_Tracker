import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiFailure, type PublicUser, type RemoteProgress } from './api';
import { upgradeStore, type Entry, type Store, type Tracker } from './state';

export type SyncStatus = 'local' | 'loading' | 'saving' | 'saved' | 'error';

/* ----------------------------------------------------------------- merge -- */

function furthest(entry: Entry): number {
  if (entry.marks.day30 === 'done') return 3;
  if (entry.marks.day7 === 'done' || entry.marks.day3 === 'done') return 2;
  return 1;
}

/** Which of two records for the same problem is further along. */
function better(a: Entry, b: Entry): Entry {
  const diff = furthest(b) - furthest(a);
  if (diff !== 0) return diff > 0 ? b : a;
  const marks = (e: Entry) => Object.values(e.marks).filter(Boolean).length;
  if (marks(b) !== marks(a)) return marks(b) > marks(a) ? b : a;
  return b.solvedOn > a.solvedOn ? b : a;
}

/**
 * Union of two stores. Nothing is thrown away: the further record wins per
 * problem, and the higher count wins per day, so signing in on a second device
 * can only add progress.
 */
export function mergeProgress(local: Store, remote: RemoteProgress): Store {
  const entries: Record<string, Entry> = { ...local.entries };
  for (const [id, entry] of Object.entries(remote.entries ?? {})) {
    entries[id] = entries[id] ? better(entries[id], entry) : entry;
  }

  const activity: Record<string, number> = { ...local.activity };
  for (const [day, count] of Object.entries(remote.activity ?? {})) {
    activity[day] = Math.max(activity[day] ?? 0, count);
  }

  const hadLocal = Object.keys(local.entries).length > 0;
  return {
    version: 2,
    planStart: hadLocal || !remote.planStart ? local.planStart : remote.planStart,
    entries,
    activity,
  };
}

const serialise = (store: Store) =>
  JSON.stringify({ planStart: store.planStart, entries: store.entries, activity: store.activity });

/* ------------------------------------------------------------------ hook -- */

export type SyncHandle = {
  status: SyncStatus;
  savedAt: string | null;
  error: string | null;
  retry: () => void;
};

export function useProgressSync(tracker: Tracker, user: PublicUser | null): SyncHandle {
  const [status, setStatus] = useState<SyncStatus>('local');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const storeRef = useRef(tracker.store);
  storeRef.current = tracker.store;
  const replaceRef = useRef(tracker.replaceStore);
  replaceRef.current = tracker.replaceStore;

  const pushed = useRef<string | null>(null);
  const generation = useRef(0);
  const userId = user?.id ?? null;

  const push = useCallback(async (serialised: string) => {
    const gen = generation.current;
    setStatus('saving');
    try {
      const store = JSON.parse(serialised) as Pick<Store, 'planStart' | 'entries' | 'activity'>;
      const result = await api.putProgress({
        planStart: store.planStart,
        entries: store.entries,
        activity: store.activity,
      });
      if (generation.current !== gen) return;
      pushed.current = serialised;
      setSavedAt(result.updatedAt);
      setStatus('saved');
      setError(null);
    } catch (caught) {
      if (generation.current !== gen) return;
      setStatus('error');
      setError(caught instanceof ApiFailure ? caught.message : 'Could not reach the API.');
    }
  }, []);

  // Adopt the account's progress when a session appears.
  useEffect(() => {
    const gen = generation.current + 1;
    generation.current = gen;
    pushed.current = null;
    setSavedAt(null);

    if (!userId) {
      setStatus('local');
      setError(null);
      return;
    }

    setStatus('loading');
    setError(null);
    (async () => {
      try {
        const remote = await api.getProgress();
        if (generation.current !== gen) return;
        const merged = mergeProgress(upgradeStore(storeRef.current), remote);
        replaceRef.current(merged);
        await push(serialise(merged));
      } catch (caught) {
        if (generation.current !== gen) return;
        // An empty account and an unreachable API both leave local progress alone.
        setStatus('error');
        setError(caught instanceof ApiFailure ? caught.message : 'Could not reach the API.');
      }
    })();
    // Deliberately keyed on the account only: the store itself is read via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, push]);

  // Push later edits, debounced so a burst of checkboxes is one request.
  useEffect(() => {
    if (!userId || status === 'loading' || status === 'local') return;
    const serialised = serialise(tracker.store);
    if (serialised === pushed.current) return;
    const timer = setTimeout(() => void push(serialised), 800);
    return () => clearTimeout(timer);
  }, [tracker.store, userId, status, push]);

  const retry = useCallback(() => {
    const serialised = serialise(storeRef.current);
    pushed.current = null;
    void push(serialised);
  }, [push]);

  return { status, savedAt, error, retry };
}
