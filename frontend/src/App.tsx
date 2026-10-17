import { useCallback, useEffect, useRef, useState } from 'react';
import { SideRail, type View } from './components/SideRail';
import { TrackerView } from './views/TrackerView';
import { ProgressView } from './views/ProgressView';
import { MethodView } from './views/MethodView';
import { HomeView } from './views/HomeView';
import { LeaderboardView } from './views/LeaderboardView';
import { AuthView, type AuthMode } from './views/AuthView';
import { useTracker, type Derived } from './lib/state';
import { WEEKS } from './data/problems';
import { AuthProvider, useAuth } from './lib/auth';
import { useProgressSync } from './lib/sync';

const VIEWS: View[] = ['home', 'tracker', 'progress', 'leaderboard', 'method', 'login'];

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
  const [dueRequest, setDueRequest] = useState(0);
  const flashTimer = useRef<number | undefined>(undefined);

  const go = useCallback((next: View) => {
    setViewState(next);
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
    setOpenWeeks(new Set(tracker.dueNow.map((d) => d.problem.week)));
    setDueRequest((n) => n + 1);
  }, [go, tracker.dueNow]);

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
            dueRequest={dueRequest}
          />
        )}
        {view === 'progress' && <ProgressView tracker={tracker} onOpenProblem={openProblem} />}
        {view === 'leaderboard' && <LeaderboardView tracker={tracker} onSignIn={() => signIn('register')} />}
        {view === 'method' && <MethodView tracker={tracker} />}
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
