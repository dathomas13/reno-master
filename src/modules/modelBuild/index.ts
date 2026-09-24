/**
 * Import of a house file: read, check, build, compare - everything before publishing.
 *
 * Pure and synchronous (no Firestore, no three.js), so the whole path is unit tested and
 * the settings screen only has to show the result. Building the scene takes a few hundred
 * milliseconds on a phone.
 */
import { buildScene } from './buildScene';
import { buildRooms, checkSource, freeWallEnds } from './checks';
import { diffSources } from './diff';
import { formatSource } from './format';
import { parseSource, type HouseSource } from './source';
import type { BuiltRooms, BuiltScene } from './types';

export { buildDxf } from './dxf';
export { buildRooms } from './checks';
export { buildPlanSvg, FLOOR_LABEL, PLAN_FLOORS, VARIANT_LABEL, type PlanFloor } from './plansSvg';
export { formatSource } from './format';
export { parseSource, SOURCE_FORMAT, type HouseSource } from './source';
export type { BuiltRooms, BuiltScene } from './types';

export interface ImportInput {
  /** the text of the imported file */
  text: string;
  /** the house file of the model in use for this variant, to compare against */
  base: HouseSource | null;
  /** the version the new model gets - always above everything this device knows */
  version: string;
  /** ISO date for meta.generatedAt */
  today: string;
}

export type ImportResult =
  | { ok: false; errors: string[]; warnings: string[]; variant?: 'ist' | 'soll' }
  | {
    ok: true;
    variant: 'ist' | 'soll';
    version: string;
    note: string;
    /** the file as it will be stored and exported again, version filled in */
    sourceText: string;
    source: HouseSource;
    scene: BuiltScene;
    rooms: BuiltRooms;
    changes: string[];
    removedRoomIds: string[];
    warnings: string[];
    /** the version the imported file said it was based on */
    basedOn: string;
  };

/** The next version after the highest known one: 0.25 -> 0.26, 0.99 -> 0.100, 0 -> 0.1. */
export function nextVersion(highest: string): string {
  const parts = String(highest || '0').split('.');
  if (parts.length < 2) parts.push('0');
  const last = Number.parseInt(parts[parts.length - 1], 10);
  parts[parts.length - 1] = String(Number.isFinite(last) ? last + 1 : 1);
  return parts.join('.');
}

export function prepareImport(input: ImportInput): ImportResult {
  const parsed = parseSource(input.text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, warnings: [] };
  const { source, raw } = parsed;
  if (input.base && input.base.variant !== source.variant) {
    return {
      ok: false,
      errors: [`Die Datei ist das ${source.variant}-Modell, verglichen wird mit ${input.base.variant}.`],
      warnings: [],
      variant: source.variant,
    };
  }

  const checked = checkSource(source);
  // a warning that was already true of the model in use is not news; report only new ones
  const known = new Set(input.base ? [...checkSource(input.base).warnings, ...freeWallEnds(input.base)] : []);
  const warnings = checked.warnings.filter((line) => !known.has(line));
  warnings.push(...freeWallEnds(source).filter((line) => !known.has(line)));
  if (checked.errors.length > 0) {
    return { ok: false, errors: checked.errors, warnings, variant: source.variant };
  }

  const basedOn = source.version;
  const note = source.note.trim();
  const finished: HouseSource = { ...source, version: input.version, note };
  let scene: BuiltScene;
  try {
    scene = buildScene(finished, { version: input.version, note, generatedAt: input.today });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [`Das Modell ließ sich nicht bauen: ${detail}`], warnings, variant: source.variant };
  }
  if (scene.prims.length === 0) {
    return { ok: false, errors: ['Das Modell enthält keine Bauteile.'], warnings, variant: source.variant };
  }
  const rooms = buildRooms(finished, input.today);
  const { changes, removedRoomIds } = diffSources(input.base, source);
  if (input.base && basedOn !== input.base.version) {
    warnings.unshift(`Die Datei beruht auf v${basedOn}, in Gebrauch ist v${input.base.version}. `
      + 'Änderungen dazwischen gehen verloren, wenn sie nicht in der Datei stehen.');
  }

  return {
    ok: true,
    variant: source.variant,
    version: input.version,
    note,
    sourceText: formatSource({ ...raw, version: input.version, note }),
    source: finished,
    scene,
    rooms,
    changes,
    removedRoomIds,
    warnings,
    basedOn,
  };
}
