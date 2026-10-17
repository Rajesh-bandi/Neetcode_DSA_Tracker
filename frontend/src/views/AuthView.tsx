import { useEffect, useRef, useState } from 'react';
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
  const { register, verify, resend, login } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<string>('console');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const fail = (caught: unknown) => {
    if (caught instanceof ApiFailure) {
      setError(caught.message);
      if (caught.retryAfter) setCooldown(caught.retryAfter);
      return caught;
    }
    setError('Something went wrong. Try again.');
    return null;
  };

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        const result = await register(email, password, name);
        setDevCode(result.devCode ?? null);
        setDelivery(result.delivery);
        setStep('code');
        setCooldown(45);
      } else {
        await login(email, password);
        onDone();
      }
    } catch (caught) {
      const failure = fail(caught);
      if (failure?.code === 'unverified') {
        setStep('code');
        setNotice('That account still needs its email verified. Request a fresh code.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verify(email, code.trim());
      onDone();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function requestCode() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = await resend(email);
      setDevCode(result.devCode ?? null);
      setDelivery(result.delivery);
      setCooldown(45);
      setNotice('A new code is on its way.');
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
            <li>Email and password, confirmed with a six-digit code.</li>
            <li>Passwords are stored as scrypt hashes — never in readable form.</li>
            <li>Codes expire in ten minutes and can be used once.</li>
            <li>Your streak, notes and re-solve dates sync both ways.</li>
          </ul>

          <blockquote className="quote authpage__quote">{RULE}</blockquote>
        </div>

        <div className="authpage__form panel">
          {step === 'form' ? (
            <form onSubmit={submitForm} noValidate>
              <div className="panel__head">
                <h2 className="h2">{mode === 'register' ? 'Create your account' : 'Sign in'}</h2>
                <span className="panel__aside">
                  <button
                    type="button"
                    className="panel__link"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      onMode(mode === 'register' ? 'login' : 'register');
                    }}
                  >
                    {mode === 'register' ? 'I have one' : 'Create one'}
                  </button>
                </span>
              </div>

              {mode === 'register' && (
                <label className="field">
                  <span className="field__label">Name</span>
                  <input
                    type="text"
                    value={name}
                    autoComplete="name"
                    placeholder="Rajesh Bandi"
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}

              <label className="field">
                <span className="field__label">Email</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  placeholder="you@gmail.com"
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
                {busy ? 'Working…' : mode === 'register' ? 'Send my code' : 'Sign in'}
              </button>

              <p className="pet__hint">
                {mode === 'register'
                  ? 'We email a six-digit code before the account opens.'
                  : 'No account yet? Create one — it takes a code and a minute.'}
              </p>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate>
              <div className="panel__head">
                <h2 className="h2">Check your email</h2>
                <span className="panel__aside">
                  <button
                    type="button"
                    className="panel__link"
                    onClick={() => {
                      setStep('form');
                      setError(null);
                      setCode('');
                    }}
                  >
                    Change details
                  </button>
                </span>
              </div>

              <p className="prose">
                Six-digit code sent to <b>{email}</b>. It expires in ten minutes.
              </p>

              <label className="field">
                <span className="field__label">Code</span>
                <input
                  ref={codeRef}
                  className="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </label>

              {devCode && (
                <p className="devhint">
                  SMTP is not set up yet, so the code is also on the server console:{' '}
                  <button type="button" className="devhint__code" onClick={() => setCode(devCode)}>
                    {devCode}
                  </button>
                </p>
              )}
              {!devCode && delivery === 'smtp' && <p className="pet__hint">Sent by email. Check the spam folder too.</p>}

              {notice && <p className="formnotice">{notice}</p>}
              {error && <p className="formerror">{error}</p>}

              <button type="submit" className="btn btn--go btn--wide" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Verify and continue'}
              </button>

              <div className="authpage__row">
                <button type="button" className="empty__link" disabled={busy || cooldown > 0} onClick={requestCode}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
                </button>
              </div>
            </form>
          )}

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
