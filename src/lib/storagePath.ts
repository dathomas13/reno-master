/**
 * The file store only accepts paths it can be sure about: letters, digits, dot, dash,
 * underscore and slash (see worker/reno-files.js). Firebase Storage used to swallow
 * anything, so the extension was taken from the file name as it was - a plan called
 * "Grundriss (EG)" with no dot ended up as "plans/<id>.grundriss (eg)" and the upload
 * would have been refused for good.
 */

const KNOWN = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'svg'] as const;

/** the extension to put in a storage path, guessed from the name, checked against the type */
export function safeExtension(name: string, type: string): string {
  const dot = name.lastIndexOf('.');
  const fromName = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if ((KNOWN as readonly string[]).includes(fromName)) return fromName;
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/svg+xml') return 'svg';
  return 'jpg';
}
