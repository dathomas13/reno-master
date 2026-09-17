/**
 * One sentence a person can act on, out of whatever the engine threw.
 *
 * Both online engines carry an HTTP status - the Claude SDK sets it, and the Gemini
 * engine copies that habit - so one helper serves both. What matters is that the message
 * names the thing to change: the key, the model, or nothing but patience.
 */

export function friendlyOcrError(error: unknown): string {
  if (!navigator.onLine) return 'Beleg-Auslesen mit Claude oder Gemini geht nur online.';

  const status = (error as { status?: number })?.status;
  const detail = error instanceof Error ? error.message : '';

  if (status === 400 || status === 401 || status === 403) {
    return `API-Key ungültig oder nicht freigeschaltet. Bitte in den Einstellungen prüfen.${
      detail ? ` (${detail})` : ''
    }`;
  }
  // Gemini answers 404 when the model name does not exist - and model names change, so
  // this has to say which setting is wrong instead of just "nicht gefunden"
  if (status === 404) return 'Dieses Modell gibt es nicht. Bitte den Modellnamen in den Einstellungen prüfen.';
  if (status === 429) return 'Zu viele Anfragen. Bitte gleich noch einmal versuchen.';
  if (status && status >= 500) return 'Der Dienst ist gerade nicht erreichbar.';
  return detail || 'Auslesen fehlgeschlagen.';
}
