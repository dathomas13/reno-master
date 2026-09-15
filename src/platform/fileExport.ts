/**
 * Writing the export into a folder on the device.
 *
 * Only exists in the Android build: a browser cannot hand a web page a folder it may
 * keep writing into, and it cannot copy a gallery photo without loading it first.
 */
import { isNative } from './index';

export interface PickedFolder {
  uri: string;
  label: string;
}

interface FileExportPlugin {
  pickFolder(): Promise<{ uri?: string; label?: string; cancelled?: boolean }>;
  canWrite(options: { treeUri: string }): Promise<{ granted: boolean }>;
  writeFile(options: {
    treeUri: string;
    path: string;
    sourceUri?: string;
    base64?: string;
    mime?: string;
  }): Promise<{ bytes: number }>;
  readFile(options: { treeUri: string; path: string }): Promise<{ base64?: string; missing?: boolean }>;
}

function plugin(): FileExportPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor
    ?.Plugins;
  return (plugins?.FileExport as FileExportPlugin | undefined) ?? null;
}

/** true when this build can write an export folder */
export function folderExportAvailable(): boolean {
  return isNative() && plugin() !== null;
}

/** asks the system for a folder; null when the user backed out */
export async function pickExportFolder(): Promise<PickedFolder | null> {
  const native = plugin();
  if (!native) return null;
  const result = await native.pickFolder();
  if (result.cancelled || !result.uri) return null;
  return { uri: result.uri, label: result.label ?? 'Ordner' };
}

/** whether the folder from an earlier export can still be written */
export async function folderStillWritable(treeUri: string): Promise<boolean> {
  const native = plugin();
  if (!native) return false;
  try {
    const { granted } = await native.canWrite({ treeUri });
    return granted;
  } catch {
    return false;
  }
}

/** copies a gallery photo into the folder without ever loading it into the app */
export async function copyIntoFolder(
  treeUri: string,
  path: string,
  sourceUri: string,
  mime = 'image/jpeg',
): Promise<number> {
  const native = plugin();
  if (!native) throw new Error('Kein Zugriff auf den Ordner');
  const { bytes } = await native.writeFile({ treeUri, path, sourceUri, mime });
  return bytes;
}

export async function writeIntoFolder(
  treeUri: string,
  path: string,
  data: Uint8Array,
  mime = 'application/octet-stream',
): Promise<number> {
  const native = plugin();
  if (!native) throw new Error('Kein Zugriff auf den Ordner');
  const { bytes } = await native.writeFile({ treeUri, path, base64: toBase64(data), mime });
  return bytes;
}

export async function readFromFolder(treeUri: string, path: string): Promise<Uint8Array | null> {
  const native = plugin();
  if (!native) return null;
  const result = await native.readFile({ treeUri, path });
  if (result.missing || !result.base64) return null;
  return fromBase64(result.base64);
}

/** in chunks, because a single apply() over a few megabytes blows the call stack */
export function toBase64(data: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let at = 0; at < data.length; at += size) {
    binary += String.fromCharCode(...data.subarray(at, at + size));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
