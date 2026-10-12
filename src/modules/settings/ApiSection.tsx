import { useState } from 'react';
import { SettingsFold } from './SettingsFold';
import { SettingsField as Field } from './SettingsHelp';
import { useAuth } from '@/auth/AuthContext';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { createApiToken, restoreApiToken, revokeApiToken, useApiTokens } from '@/data/apiTokens';
import {
  API_SCOPES,
  apiAddresses,
  formatTokenDate,
  isExpired,
  type ApiScope,
  type ApiToken,
} from '@/data/apiTokenFormat';

const FILES_URL = String(import.meta.env.VITE_FILES_URL ?? '');

const VALIDITY = [
  { value: '30', label: '30 Tage' },
  { value: '90', label: '90 Tage' },
  { value: '365', label: '1 Jahr' },
  { value: '', label: 'Unbegrenzt' },
];

/**
 * Access for clients outside the app - Claude in a chat above all - through the API in the
 * file worker (PLAN.md 5.14, worker/README.md). A token is shown once, then only its hash
 * is left; revoking works like every delete in the app, with "Rückgängig".
 */
export function ApiSection() {
  const { user } = useAuth();
  const { tokens } = useApiTokens();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const [name, setName] = useState('Claude');
  const [scopes, setScopes] = useState<ApiScope[]>(API_SCOPES.map((scope) => scope.id));
  const [validity, setValidity] = useState('365');
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const active = tokens.filter((token) => !isExpired(token));
  const summary = !FILES_URL
    ? 'Nicht eingerichtet'
    : active.length === 0
      ? 'Kein Token'
      : active.length === 1
        ? '1 Token aktiv'
        : `${active.length} Token aktiv`;

  function toggleScope(id: ApiScope, on: boolean) {
    setScopes((current) => (on ? [...current, id] : current.filter((scope) => scope !== id)));
  }

  async function create() {
    if (!user?.email || scopes.length === 0) return;
    setBusy(true);
    try {
      const created = await createApiToken({
        name,
        scopes: API_SCOPES.map((scope) => scope.id).filter((id) => scopes.includes(id)),
        days: validity ? Number(validity) : null,
        owner: user.email,
      });
      setFresh({ name: name.trim() || 'Token', token: created.token });
      // offline the entry waits in the queue; the token works once it has arrived
      void created.saved.catch(() => toast('Das Token konnte nicht gespeichert werden.'));
    } catch {
      toast('Das Token konnte nicht erzeugt werden.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} kopiert.`);
    } catch {
      toast('Kopieren nicht möglich.');
    }
  }

  function revoke(token: ApiToken) {
    undoableDelete(
      `„${token.name}“ widerrufen`,
      () => revokeApiToken(token.id),
      () => restoreApiToken(token),
    );
  }

  const addresses = apiAddresses(FILES_URL, fresh?.token);

  return (
    <SettingsFold title="API-Zugang" summary={summary}>
      <p className="text-sm text-muted mb-3">
        Damit können andere Programme – vor allem Claude im Chat – Kosten, Aufgaben, Tagebucheinträge und Notizen
        anlegen. Jedes Token wird genau einmal angezeigt und lässt sich jederzeit widerrufen.
      </p>

      {!FILES_URL && (
        <p className="text-sm text-warn mb-3">Der Dateispeicher ist nicht eingerichtet; ohne ihn gibt es keine API.</p>
      )}

      {tokens.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {tokens.map((token) => (
            <li key={token.id} className="flex items-start gap-3 border-b border-line pb-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {token.name}{' '}
                  <span className="text-xs text-muted font-mono">{token.hint}</span>
                </p>
                <p className="text-xs text-muted">
                  {API_SCOPES.filter((scope) => token.scopes.includes(scope.id))
                    .map((scope) => scope.label)
                    .join(' · ') || 'keine Rechte'}
                </p>
                <p className={`text-xs ${isExpired(token) ? 'text-warn' : 'text-muted'}`}>
                  erstellt {formatTokenDate(token.createdAt)}
                  {token.createdBy ? ` von ${token.createdBy}` : ''}
                  {' · '}
                  {token.lastUsedAt ? `zuletzt benutzt ${formatTokenDate(token.lastUsedAt)}` : 'noch nie benutzt'}
                  {' · '}
                  {token.expiresAt
                    ? `${isExpired(token) ? 'abgelaufen' : 'gilt bis'} ${formatTokenDate(token.expiresAt)}`
                    : 'unbegrenzt'}
                </p>
              </div>
              <button type="button" className="btn" onClick={() => revoke(token)}>
                Widerrufen
              </button>
            </li>
          ))}
        </ul>
      )}

      {fresh ? (
        <div className="rounded border border-accent p-3 flex flex-col gap-3">
          <p className="text-sm">
            Token „{fresh.name}“ – <strong>jetzt kopieren</strong>, es wird nicht noch einmal angezeigt.
          </p>
          <code className="block text-xs break-all bg-bg p-2 rounded select-all">{fresh.token}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void copy(fresh.token, 'Token')}>
              Token kopieren
            </button>
            {addresses.mcpWithToken && (
              <button type="button" className="btn" onClick={() => void copy(addresses.mcpWithToken ?? '', 'Connector-Adresse')}>
                Adresse für Claude kopieren
              </button>
            )}
          </div>
          {FILES_URL && (
            <p className="text-xs text-muted break-all">
              Claude-App: Einstellungen → Connectors → eigenen Connector hinzufügen, dort die kopierte Adresse
              einfügen (sie enthält das Token). Claude Code und andere Programme: {addresses.mcp} bzw.{' '}
              {addresses.rest} mit der Kopfzeile „Authorization: Bearer &lt;Token&gt;“.
            </p>
          )}
          <button type="button" className="btn self-start" onClick={() => setFresh(null)}>
            Fertig
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          <Field label="Name" hint="Wofür das Token ist, z. B. „Claude-App“ – nur zum Wiedererkennen in dieser Liste.">
            <input className="field" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
          </Field>
          <fieldset className="mb-4">
            <legend className="label mb-2">Rechte</legend>
            {API_SCOPES.map((scope) => (
              <label key={scope.id} className="flex items-center gap-3 min-h-11">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-accent"
                  checked={scopes.includes(scope.id)}
                  onChange={(event) => toggleScope(scope.id, event.target.checked)}
                />
                <span>{scope.label}</span>
              </label>
            ))}
          </fieldset>
          <Field label="Gültig">
            <select className="field" value={validity} onChange={(event) => setValidity(event.target.value)}>
              {VALIDITY.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="btn btn-primary self-start"
            disabled={busy || !FILES_URL || !user?.email || scopes.length === 0}
            onClick={() => void create()}
          >
            Token erzeugen
          </button>
        </div>
      )}
    </SettingsFold>
  );
}
