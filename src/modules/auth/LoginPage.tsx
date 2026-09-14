import { useState, type FormEvent } from 'react';
import { signIn, friendlyAuthError } from '@/firebase/auth';
import { isFirebaseConfigured } from '@/firebase/app';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (cause) {
      setError(friendlyAuthError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex flex-col justify-center px-6 py-10 max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-1">Reno Master</h1>
      <p className="text-muted mb-8">Schlesierstraße 31</p>

      {!isFirebaseConfigured && (
        <p className="card p-3 mb-4 text-sm text-warn">
          Firebase ist noch nicht konfiguriert. Trage die Werte in <code>.env</code> ein.
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="email">E-Mail</label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Passwort</label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && <p className="text-bad text-sm">{error}</p>}
        <button className="btn btn-primary mt-2" type="submit" disabled={busy}>
          {busy ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>

      <p className="text-muted text-xs mt-8 leading-relaxed">
        Die Anmeldung wird gespeichert. Danach läuft die App auch ohne Netz weiter.
      </p>
    </div>
  );
}
