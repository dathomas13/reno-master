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
import { ZipWriter } from '@/lib/zip';
import { looksLikeZip, readZip } from '@/lib/unzip';
import { today } from '@/lib/date';
import {
  buildDxf,
  nextVersion,
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
      notes.push(`${VARIANT_LABEL[variant]}: keine Hausdatei gefunden.`);
      continue;
    }
    if (!source.matches) {
      const active = await activeRelease(variant);
      notes.push(`${VARIANT_LABEL[variant]}: das Modell v${active?.version ?? '?'} wurde ohne Hausdatei veröffentlicht. `
        + `Im Export steht die Hausdatei v${source.version}.`);
    }
    versions.push(`${VARIANT_LABEL[variant]} v${source.version}`);
    files.push([`haus-${variant}.json`, source.text]);
    const parsed = parseSource(source.text);
    if (parsed.ok) files.push([`grundriss-${variant}.dxf`, buildDxf(parsed.source)]);
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
    const variant = (JSON.parse(text.replace(/^﻿/, '')) as { variant?: unknown }).variant;
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
    await syncModel(variant, true).catch(() => null);
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
  await syncAllModels(false);
}
