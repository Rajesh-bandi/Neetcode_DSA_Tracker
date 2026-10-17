import { useCallback, useEffect, useState } from 'react';
import { api, ApiFailure, type LeaderRow } from './api';

export type LeaderboardState = {
  entries: LeaderRow[];
  you: LeaderRow | null;
  /** Everyone on the board, which can be more than the returned rows. */
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/** Loads the board for a signed-in account; guests get an idle, empty board. */
export function useLeaderboard(enabled: boolean, today: string): LeaderboardState {
  const [entries, setEntries] = useState<LeaderRow[]>([]);
  const [you, setYou] = useState<LeaderRow | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setEntries([]);
      setYou(null);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const board = await api.leaderboard(today);
        if (cancelled) return;
        setEntries(board.entries);
        setYou(board.you);
        setTotal(board.total);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiFailure ? caught.message : 'Could not load the board.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, today, nonce]);

  return { entries, you, total, loading, error, reload };
}
