/**
 * Export and import of the house model - the way to edit it outside the app.
 *
 * Export packs what an outside tool needs into one ZIP: the instructions, the house file
 * of each variant and the floor plans as DXF. Import takes the edited house file back (on
 * its own or inside the ZIP), checks and builds it on the device, and publishes it through
 * the Firestore channel of modelSync - no Python, no deploy. The plan behind it is
 * tools/model/PLAN-MODELL-WORKFLOW.md.
 */
import anleitung from '../../tools/model/ANLEITUNG-EXTERN.md?raw';
// The model as it stood when it left the repository (Ist v0.27, Soll v0.24, room names
// and the Ist -> Soll mapping of 0.48.7) - for the one-time move into the database
// (publishStartModel). Remove, together with that function, once both are published.
// It doubles as the frozen test data in tools/model/testdata.
import startIst from '../../tools/model/testdata/haus-ist.json?raw';
import startSoll from '../../tools/model/testdata/haus-soll.json?raw';
import { ZipWriter } from '@/lib/zip';
import { looksLikeZip, readZip } from '@/lib/unzip';
import { today } from '@/lib/date';
import {
  buildDxf,
  buildPlanSvg,
  buildRooms,
  nextVersion,
  PLAN_FLOORS,
  parseSource,
  prepareImport,
  type HouseSource,
  type ImportResult,
} from '@/modules/modelBuild';
import { compareVersions, VARIANTS, type Variant } from './modelRelease';
import { readRelease } from './modelStore';
import { activeRelease, clearPreview, loadSource, setPreview } from './models';
import { publishModel, syncAllModels, syncModel } from './modelSync';
import type { RoomDoc, SceneDoc } from '@/modules/viewer3d/houseScene';

const VARIANT_LABEL: Record<Variant, string> = { ist: 'Bestand', soll: 'Zielzustand' };

export interface ExportArchive {
  name: string;
  data: Uint8Array;
  /** anything the user should know about what went in */
  notes: string[];
}

export async function buildExportArchive(now = new Date()): Promise<ExportArchive> {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((chunk) => {
    chunks.push(new Uint8Array(chunk));
  });
  const encode = (text: string) => new TextEncoder().encode(text);
  const notes: string[] = [];
  const versions: string[] = [];
  const files: [string, string][] = [];

  for (const variant of VARIANTS) {
    const source = await loadSource(variant);
    if (!source) {
      notes.push(`${VARIANT_LABEL[variant]}: auf diesem Gerät ist kein Modell mit Hausdatei.`);
      continue;
    }
    versions.push(`${VARIANT_LABEL[variant]} v${source.version}`);
    files.push([`haus-${variant}.json`, source.text]);
    const parsed = parseSource(source.text);
    if (parsed.ok) {
      files.push([`grundriss-${variant}.dxf`, buildDxf(parsed.source)]);
      const rooms = buildRooms(parsed.source, '');
      for (const floor of PLAN_FLOORS) {
        files.push([`grundriss-${variant}-${floor}.svg`, buildPlanSvg(parsed.source, rooms, floor, source.version)]);
      }
    }
  }
  if (files.length === 0) throw new Error('Es gibt kein Modell zum Exportieren.');

  const header = `> Export aus Reno Master vom ${today()}: ${versions.join(', ')}.\n\n`;
  await zip.add('ANLEITUNG.md', encode(header + anleitung), now);
  for (const [name, text] of files) await zip.add(name, encode(text), now);
  await zip.finish();

  const data = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    data.set(chunk, at);
    at += chunk.length;
  }
  return { name: `reno-modell-${today()}.zip`, data, notes };
}

/**
 * The house files among the chosen files: .json files directly, and every haus-*.json
 * (or any JSON that says it is a house file) inside a ZIP.
 */
export async function readImportFiles(files: File[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  const decoder = new TextDecoder();
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeZip(bytes)) {
      out.push({ name: file.name, text: decoder.decode(bytes) });
      continue;
    }
    for (const entry of await readZip(bytes)) {
      const base = entry.name.split('/').pop() ?? entry.name;
      if (base.startsWith('.') || entry.name.startsWith('__MACOSX/') || !base.endsWith('.json')) continue;
      const text = decoder.decode(entry.data);
      if (/"format"\s*:\s*"reno-haus\/1"/.test(text)) out.push({ name: `${file.name} › ${base}`, text });
    }
  }
  return out;
}

export interface PreparedImport {
  fileName: string;
  result: ImportResult;
  /** the house file in use before, when the imported one changes nothing */
  unchanged: boolean;
}

function variantOf(text: string): Variant | null {
  try {
    const variant = (JSON.parse(text.replace(/^\uFEFF/, '')) as { variant?: unknown }).variant;
    return variant === 'ist' || variant === 'soll' ? variant : null;
  } catch {
    return null;
  }
}

/**
 * Checks and builds one imported house file against the model in use.
 *
 * Asks the other channels first, so the new version is above anything another device may
 * have published in the meantime. Offline that step simply finds nothing new.
 */
export async function prepareModelImport(fileName: string, text: string): Promise<PreparedImport> {
  const variant = variantOf(text);
  let base: HouseSource | null = null;
  const known: string[] = [];
  if (variant) {
    await syncModel(variant).catch(() => null);
    const [source, active, cached] = await Promise.all([loadSource(variant), activeRelease(variant), readRelease(variant)]);
    if (source) {
      const parsed = parseSource(source.text);
      if (parsed.ok) base = parsed.source;
      known.push(source.version);
    }
    if (active) known.push(active.version);
    if (cached) known.push(cached.version);
  }
  const highest = known.reduce((best, version) => (compareVersions(version, best) > 0 ? version : best), '0');
  const result = prepareImport({ text, base, version: nextVersion(highest), today: today() });
  const unchanged = result.ok && base !== null && result.changes.length === 0;
  return { fileName, result, unchanged };
}

/** shows the built model in the 3D view without publishing it */
export function previewImport(result: Extract<ImportResult, { ok: true }>): void {
  setPreview(result.variant, {
    version: result.version,
    scene: result.scene as SceneDoc,
    rooms: result.rooms as RoomDoc,
    source: result.source,
  });
}

/** publishes a built model to every device, with its house file */
export async function publishImport(result: Extract<ImportResult, { ok: true }>): Promise<void> {
  await publishModel({
    variant: result.variant,
    sceneJson: JSON.stringify(result.scene),
    roomsJson: JSON.stringify(result.rooms),
    sourceJson: result.sourceText,
    note: result.note,
  });
  clearPreview(result.variant);
  await syncAllModels();
}

/** the version the start model of a variant would be published as */
export function startVersion(variant: Variant): string {
  const parsed = parseSource(variant === 'ist' ? startIst : startSoll);
  return parsed.ok ? parsed.source.version : '0';
}

/**
 * Moves the model into the database once: publishes the house file the model had when it
 * still shipped with the app, built on this device like any import. Only offered while
 * the database has no model for the variant, or only an older one without house file.
 */
export async function publishStartModel(variant: Variant): Promise<string> {
  const text = variant === 'ist' ? startIst : startSoll;
  const parsed = parseSource(text);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  const result = prepareImport({ text, base: null, version: parsed.source.version, today: today() });
  if (!result.ok) throw new Error(result.errors.join(' '));
  await publishImport(result);
  return result.version;
}
