/**
 * Hands a small generated file to the user - the model export.
 *
 * In the browser a download does it. In the Android app a blob download goes nowhere, so
 * the file is written to the app's cache and offered through the system share sheet:
 * from there it goes to Drive, a mail, or straight into the app of another AI. When the
 * share sheet is missing, the folder picker of the archive export is the fallback.
 *
 * Native plugins are reached through Capacitor.Plugins, never through a dynamic import -
 * see CLAUDE.md, the import never arrives inside the WebView.
 */
import { isNative } from './index';
import { pickExportFolder, toBase64, writeIntoFolder } from './fileExport';
import { debugLog } from './debugLog';

interface FilesystemPlugin {
  writeFile(options: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }>;
}

interface SharePlugin {
  share(options: { title?: string; text?: string; files?: string[]; dialogTitle?: string }): Promise<unknown>;
}

function plugins(): Record<string, unknown> {
  return (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins ?? {};
}

export type HandOver = 'download' | 'share' | 'folder' | 'cancelled';

export async function handOverFile(name: string, data: Uint8Array, mime: string): Promise<HandOver> {
  if (!isNative()) {
    const url = URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'download';
  }

  const filesystem = plugins().Filesystem as FilesystemPlugin | undefined;
  const share = plugins().Share as SharePlugin | undefined;
  if (filesystem && share) {
    try {
      const { uri } = await filesystem.writeFile({ path: name, data: toBase64(data), directory: 'CACHE' });
      await share.share({ title: name, files: [uri], dialogTitle: 'Modell weitergeben' });
      return 'share';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // closing the share sheet is not a failure
      if (/cancel/i.test(message)) return 'cancelled';
      debugLog('modell-export', `Teilen fehlgeschlagen, weiter mit Ordnerwahl: ${message}`);
    }
  }

  const folder = await pickExportFolder();
  if (!folder) return 'cancelled';
  await writeIntoFolder(folder.uri, name, data, mime);
  return 'folder';
}
