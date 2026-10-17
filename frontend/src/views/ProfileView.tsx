import { useState } from 'react';
import { ApiFailure } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Tracker } from '../lib/state';

type Props = { tracker: Tracker; onSignIn: () => void };

export function ProfileView({ tracker, onSignIn }: Props) {
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clearNotice, setClearNotice] = useState<string | null>(null);

  const hasProgress = Object.keys(tracker.store.entries).length > 0 || Object.keys(tracker.store.activity).length > 0;

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const signedOut = await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice(`Password changed. ${signedOut ? `${signedOut} other session${signedOut === 1 ? ' was' : 's were'} signed out.` : 'This device stays signed in.'}`);
    } catch (caught) {
      setError(caught instanceof ApiFailure ? caught.message : 'Could not change your password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function clearProgress() {
    if (!hasProgress) return;
    if (window.confirm('Clear all problems, notes, re-solve marks, and activity? This cannot be undone.')) {
      tracker.resetAll();
      setClearNotice('Progress cleared.');
    }
  }

  return (
    <div className="wrap settings">
      <header className="pagehead">
        <div className="pagehead__row">
          <h1 className="h1">Profile</h1>
        </div>
        <p className="prose" style={{ maxWidth: '58ch' }}>
          Your account, password, and study data.
        </p>
      </header>

      <section className="panel settings__account">
        <div className="panel__head">
          <h2 className="h2">Account</h2>
          <span className="panel__aside">{user ? 'signed in' : 'guest'}</span>
        </div>
        {user ? (
          <dl className="settings__identity">
            <div><dt>Username</dt><dd>{user.username ?? user.name}</dd></div>
            <div><dt>Gmail</dt><dd>{user.email}</dd></div>
          </dl>
        ) : (
          <div className="settings__signedout">
            <p>Sign in to change the password for your account.</p>
            <button type="button" className="btn btn--go" onClick={onSignIn}>Sign in</button>
          </div>
        )}
      </section>

      <section className="panel settings__password">
        <div className="panel__head">
          <h2 className="h2">Change password</h2>
          <span className="panel__aside">at least 8 characters</span>
        </div>
        {user ? (
          <form className="settings__form" onSubmit={submitPassword}>
            <label className="field">
              <span className="field__label">Current password</span>
              <input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>
            <div className="settings__formrow">
              <label className="field">
                <span className="field__label">New password</span>
                <input
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Confirm new password</span>
                <input
                  id="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>
            </div>
            {error && <p className="formerror" role="alert">{error}</p>}
            {notice && <p className="formnotice" role="status">{notice}</p>}
            <button type="submit" className="btn btn--go" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : (
          <p className="settings__note">Password changes are available after you sign in.</p>
        )}
      </section>

      <section className="panel settings__danger">
        <div className="panel__head">
          <h2 className="h2">Clear progress</h2>
          <span className="panel__aside">cannot be undone</span>
        </div>
        <p className="settings__note">
          Remove solved problems, notes, re-solve marks, and study activity{user ? ' from your account' : ' from this device'}.
        </p>
        {clearNotice && <p className="formnotice" role="status">{clearNotice}</p>}
        <button type="button" className="settings__clear" disabled={!hasProgress} onClick={clearProgress}>
          Clear all progress
        </button>
      </section>
    </div>
  );
}
