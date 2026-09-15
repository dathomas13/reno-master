/**
 * Turning a version into a number.
 *
 * "0.17.0" against "0.9.3" is not a string comparison, and Android wants an integer for
 * versionCode anyway. One place for the rule, used by the build (vite.config.ts writes it
 * into the bundle and into the APK) and by the workflows through the same file.
 */
export function versionCode(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  // a thousand steps per position, far more than this app will ever need
  return major * 1_000_000 + minor * 1_000 + patch;
}
