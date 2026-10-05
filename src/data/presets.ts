import type { ListKey } from './types';

export type PresetKind = 'strings' | 'trades' | 'rooms' | 'roomMap';
export type PresetSection = 'Haus' | 'Bautagebuch' | 'Projekt' | 'Kosten' | 'Aufgaben' | 'Kontakte';

export interface PresetDef {
  /** route segment under /einstellungen/voreinstellungen */
  key: string;
  /** the field of meta/lists, for kind 'strings' */
  listKey?: ListKey;
  kind: PresetKind;
  section: PresetSection;
  title: string;
  subtitle: string;
  singular: string;
  placeholder: string;
  maxLength: number;
}

export const PRESETS: PresetDef[] = [
  {
    key: 'raeume', kind: 'rooms', section: 'Haus', title: 'Räume',
    subtitle: 'Namen ändern erzeugt eine neue Modellversion', singular: 'Raum',
    placeholder: 'Neuer Raum …', maxLength: 40,
  },
  {
    key: 'raumzuordnung', kind: 'roomMap', section: 'Haus', title: 'Zuordnung Bestand → Planung',
    subtitle: 'Wohin alte Einträge wandern', singular: 'Zuordnung',
    placeholder: '', maxLength: 40,
  },
  {
    key: 'gewerke', kind: 'trades', section: 'Projekt', title: 'Gewerke',
    subtitle: 'Gewerke des Projekts', singular: 'Gewerk',
    placeholder: 'Neues Gewerk …', maxLength: 60,
  },
  {
    key: 'personen', listKey: 'people', kind: 'strings', section: 'Bautagebuch', title: 'Anwesende Personen',
    subtitle: 'Auswahl im Bautagebuch', singular: 'Person',
    placeholder: 'Person hinzufügen …', maxLength: 60,
  },
  {
    key: 'wetter', listKey: 'weather', kind: 'strings', section: 'Bautagebuch', title: 'Wetter',
    subtitle: 'Auswahl im Bautagebuch', singular: 'Wetter',
    placeholder: 'Wetter hinzufügen …', maxLength: 60,
  },
  {
    key: 'kategorien', listKey: 'costCategories', kind: 'strings', section: 'Kosten', title: 'Kategorien',
    subtitle: 'Kostenkategorien', singular: 'Kategorie',
    placeholder: 'Kategorie hinzufügen …', maxLength: 60,
  },
  {
    key: 'bereiche', listKey: 'taskAreas', kind: 'strings', section: 'Aufgaben', title: 'Bereiche',
    subtitle: 'Bereiche der Aufgaben', singular: 'Bereich',
    placeholder: 'Bereich hinzufügen …', maxLength: 60,
  },
  {
    key: 'rollen', listKey: 'contactRoles', kind: 'strings', section: 'Kontakte', title: 'Rollen',
    subtitle: 'Rollen der Kontakte', singular: 'Rolle',
    placeholder: 'Rolle hinzufügen …', maxLength: 60,
  },
];

export function findPreset(key: string | undefined): PresetDef | undefined {
  return PRESETS.find((preset) => preset.key === key);
}
