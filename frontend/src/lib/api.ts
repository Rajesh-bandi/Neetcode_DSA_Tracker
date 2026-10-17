import type { Entry } from './state';

export type PublicUser = {
  id: string;
  username: string;
  name: string;
  email: string;
  createdAt: string;
  verified: boolean;
};

export type StreakInfo = {
  current: number;
  longest: number;
  activeToday: boolean;
  totalDays: number;
};

export type RemoteProgress = {
  planStart: string | null;
  entries: Record<string, Entry>;
  activity: Record<string, number>;
  updatedAt: string | null;
};

export type LeaderRow = {
  rank: number;
  id: string;
  name: string;
  initials: string;
  solved: number;
  mastered: number;
  currentStreak: number;
  longestStreak: number;
  activeDays: number;
  activeToday: boolean;
  isYou: boolean;
};

export class ApiFailure extends Error {
  status: number;
  code?: string;
  field?: string;
  retryAfter?: number;

  constructor(message: string, init: { status: number; code?: string; field?: string; retryAfter?: number }) {
    super(message);
    this.name = 'ApiFailure';
    this.status = init.status;
    this.code = init.code;
    this.field = init.field;
    this.retryAfter = init.retryAfter;
  }
}

/**
 * Where the API lives. Empty means same origin, which is what the dev proxy and
 * a single-host deploy use. When the frontend is hosted apart from the API
 * (Vercel talking to Render) set VITE_API_BASE_URL to the API's origin and the
 * session cookie travels cross-site instead.
 */
const env = import.meta.env as { VITE_API_BASE_URL?: string } | undefined;
const API_BASE = (env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: API_BASE ? 'include' : 'same-origin',
      headers: init.body ? { 'content-type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiFailure('The API is not reachable. Progress still saves on this device.', { status: 0 });
  }

  let data: unknown = null;
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    data = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; field?: string; retryAfter?: number };
    throw new ApiFailure(body.error ?? `Request failed (${response.status}).`, {
      status: response.status,
      code: body.code,
      field: body.field,
      retryAfter: body.retryAfter,
    });
  }

  return data as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  async me() {
    try {
      return await request<{ user: PublicUser; streak: StreakInfo }>('/api/auth/me');
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) return null;
      throw error;
    }
  },

  register: (email: string, password: string, name: string, username: string) =>
    post<{ user: PublicUser; streak: StreakInfo }>(
      '/api/auth/register',
      { email, password, name, username },
    ),
  login: (identifier: string, password: string) => post<{ user: PublicUser; streak: StreakInfo }>('/api/auth/login', { identifier, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ changed: true; otherSessionsSignedOut: number }>('/api/auth/change-password', { currentPassword, newPassword }),

  logout: () => post<{ ok: true }>('/api/auth/logout'),

  logoutEverywhere: () => post<{ ok: true; signedOut: number }>('/api/auth/sign-out-everywhere'),

  getProgress: () => request<RemoteProgress & { streak: StreakInfo }>('/api/progress'),

  putProgress: (payload: { planStart: string; entries: Record<string, Entry>; activity: Record<string, number> }) =>
    request<{ saved: true; updatedAt: string; solved: number; mastered: number; streak: StreakInfo }>('/api/progress', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  leaderboard: (today: string) =>
    request<{ today: string; total: number; entries: LeaderRow[]; you: LeaderRow | null }>(
      `/api/leaderboard?today=${encodeURIComponent(today)}`,
    ),
};
