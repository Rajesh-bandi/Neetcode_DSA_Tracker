import { useCallback, useEffect, useRef, useState } from 'react';
import { SideRail, type View } from './components/SideRail';
import { TrackerView } from './views/TrackerView';
import { ProgressView } from './views/ProgressView';
import { MethodView } from './views/MethodView';
import { HomeView } from './views/HomeView';
import { LeaderboardView } from './views/LeaderboardView';
import { AuthView, type AuthMode } from './views/AuthView';
import { SettingsView } from './views/SettingsView';
import { useTracker, type Derived } from './lib/state';
import { WEEKS } from './data/problems';
import { AuthProvider, useAuth } from './lib/auth';
import { useProgressSync } from './lib/sync';

const VIEWS: View[] = ['home', 'tracker', 'progress', 'leaderboard', 'method', 'settings', 'login'];

function viewFromHash(): View {
  if (typeof window === 'undefined') return 'home';
  const raw = window.location.hash.replace(/^#\/?/, '');
  return (VIEWS as string[]).includes(raw) ? (raw as View) : 'home';
}

function Shell() {
  const tracker = useTracker();
  const { user } = useAuth();
  const sync = useProgressSync(tracker, user);

  const [view, setViewState] = useState<View>(viewFromHash);
  const [authMode, setAuthMode] = useState<AuthMode>('register');
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(() => new Set([tracker.planPosition?.week ?? 1]));
  const [flashId, setFlashId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [trackerIntent, setTrackerIntent] = useState<{ filter: 'due' | 'all'; nonce: number } | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const go = useCallback((next: View) => {
    setViewState(next);
    // A filter left over from an earlier "open due" click should not follow you
    // into the next visit to the tracker.
    setTrackerIntent(null);
    if (window.location.hash !== `#/${next}`) window.location.hash = `#/${next}`;
  }, []);

  const signIn = useCallback(
    (mode: AuthMode = 'register') => {
      setAuthMode(mode);
      go('login');
    },
    [go],
  );

  useEffect(() => {
    const onHash = () => setViewState(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target.id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [target]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const openProblem = useCallback(
    (item: Derived) => {
      go('tracker');
      setOpenWeeks((prev) => new Set(prev).add(item.problem.week));
      setFlashId(item.problem.id);
      setTarget({ id: `prob-${item.problem.id}`, nonce: Date.now() });
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashId(null), 1800);
    },
    [go],
  );

  const jumpToWeek = useCallback(
    (week: number) => {
      go('tracker');
      setOpenWeeks((prev) => new Set(prev).add(week));
      const first = tracker.derived.find((d) => d.problem.week === week);
      setTarget({ id: first ? `prob-${first.problem.id}` : `week-${week}-body`, nonce: Date.now() });
    },
    [go, tracker.derived],
  );

  const openDue = useCallback(() => {
    go('tracker');
    if (tracker.dueNow.length > 0) {
      setOpenWeeks(new Set(tracker.dueNow.map((d) => d.problem.week)));
      setTrackerIntent({ filter: 'due', nonce: Date.now() });
      return;
    }
    // Nothing is due yet, so "today's queue" is the current week's problems —
    // filtering to an empty due list would leave the tracker looking broken.
    setOpenWeeks((prev) => new Set(prev).add(tracker.planPosition?.week ?? 1));
    setTrackerIntent({ filter: 'all', nonce: Date.now() });
  }, [go, tracker.dueNow, tracker.planPosition]);

  return (
    <div className="shell">
      <SideRail view={view} onView={go} tracker={tracker} sync={sync} onJumpToWeek={jumpToWeek} />
      <main className="main">
        {view === 'home' && (
          <HomeView
            tracker={tracker}
            sync={sync}
            onOpenDue={openDue}
            onOpenTracker={() => go('tracker')}
            onOpenWeek={jumpToWeek}
            onOpenLeaderboard={() => go('leaderboard')}
            onSignIn={() => signIn('register')}
          />
        )}
        {view === 'tracker' && (
          <TrackerView
            tracker={tracker}
            openWeeks={openWeeks}
            setOpenWeeks={setOpenWeeks}
            flashId={flashId}
            intent={trackerIntent}
          />
        )}
        {view === 'progress' && <ProgressView tracker={tracker} onOpenProblem={openProblem} />}
        {view === 'leaderboard' && <LeaderboardView tracker={tracker} onSignIn={() => signIn('register')} />}
        {view === 'method' && <MethodView tracker={tracker} />}
        {view === 'settings' && <SettingsView tracker={tracker} onSignIn={() => signIn('login')} />}
        {view === 'login' && (
          <AuthView mode={authMode} onMode={setAuthMode} onDone={() => go('home')} onSkip={() => go('tracker')} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

// Keeps the week count honest if the generated data ever changes.
if (WEEKS.length !== 12) {
  console.warn(`expected 12 weeks of data, found ${WEEKS.length}`);
}
