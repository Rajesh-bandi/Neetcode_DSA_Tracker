import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiFailure } from '../lib/api';
import { RULE } from '../data/method';

export type AuthMode = 'login' | 'register';

type Props = {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  onDone: () => void;
  onSkip: () => void;
};

export function AuthView({ mode, onMode, onDone, onSkip }: Props) {
  const { register, login } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (caught: unknown) => {
    if (caught instanceof ApiFailure) {
      setError(caught.message);
      return caught;
    }
    setError('Something went wrong. Try again.');
    return null;
  };

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await register(email, password, username, username);
        onDone();
      } else {
        await login(email, password);
        onDone();
      }
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="authpage">
        <div className="authpage__intro">
          <span className="label">Account</span>
          <h1 className="h1">{mode === 'register' ? 'Keep the streak in one place' : 'Welcome back'}</h1>
          <p className="prose">
            {mode === 'register'
              ? 'An account moves your progress off this browser and onto the server, so a cleared cache or a second laptop picks up where you left off.'
              : 'Sign in to bring your streak, your heatmap and your place on the board back.'}
          </p>

          <ul className="rules rules--tight">
            <li>Sign in with your username or Gmail address and password.</li>
            <li>Passwords are stored as scrypt hashes — never in readable form.</li>
            <li>Your streak, notes and re-solve dates sync both ways.</li>
          </ul>

          <blockquote className="quote authpage__quote">{RULE}</blockquote>
        </div>

        <div className="authpage__form panel">
          <form onSubmit={submitForm} noValidate>
              <div className="panel__head">
                <h2 className="h2">{mode === 'register' ? 'Create your account' : 'Sign in'}</h2>
                <span className="panel__aside">
                  <button
                    type="button"
                    className="panel__link"
                    onClick={() => {
                      setError(null);
                      onMode(mode === 'register' ? 'login' : 'register');
                    }}
                  >
                    {mode === 'register' ? 'I have one' : 'Create one'}
                  </button>
                </span>
              </div>

              {mode === 'register' && (
                <label className="field">
                  <span className="field__label">Username</span>
                  <input
                    type="text"
                    value={username}
                    autoComplete="username"
                    placeholder="rajesh"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
              )}

              <label className="field">
                <span className="field__label">{mode === 'register' ? 'Gmail' : 'Username or Gmail'}</span>
                <input
                  type={mode === 'register' ? 'email' : 'text'}
                  value={email}
                  autoComplete={mode === 'register' ? 'email' : 'username'}
                  placeholder={mode === 'register' ? 'you@gmail.com' : 'username or you@gmail.com'}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">Password</span>
                <input
                  type="password"
                  value={password}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'register' ? 'at least 8 characters' : '••••••••'}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>

              {error && <p className="formerror">{error}</p>}

              <button type="submit" className="btn btn--go btn--wide" disabled={busy}>
                {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
              </button>

              <p className="pet__hint">
                {mode === 'register'
                  ? 'Use your username, Gmail address, and password to create an account.'
                  : 'Sign in with your username or Gmail address and password.'}
              </p>
          </form>

          <div className="authpage__foot">
            <button type="button" className="empty__link" onClick={onSkip}>
              Continue without an account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
