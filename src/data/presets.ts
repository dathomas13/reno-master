import type { OptionSetKey } from './options';

export type PresetKind = 'options' | 'trades' | 'phases' | 'rooms' | 'roomMap';
export type PresetSection = 'Haus' | 'Bautagebuch' | 'Projekt' | 'Kosten' | 'Aufgaben' | 'Kontakte';

export interface PresetDef {
  /** route segment under /einstellungen/voreinstellungen */
  key: string;
  /** the option set, for kind 'options' */
  setKey?: OptionSetKey;
  kind: PresetKind;
  section: PresetSection;
  title: string;
  subtitle: string;
  singular: string;
  placeholder: string;
  maxLength: number;
}

function options(
  key: string,
  setKey: OptionSetKey,
  section: PresetSection,
  title: string,
  subtitle: string,
  singular: string,
  placeholder = `${singular} hinzufügen …`,
): PresetDef {
  return { key, setKey, kind: 'options', section, title, subtitle, singular, placeholder, maxLength: 60 };
}

/** the groups in the order the overview shows them */
export const PRESET_SECTIONS: PresetSection[] = ['Haus', 'Bautagebuch', 'Projekt', 'Kosten', 'Aufgaben', 'Kontakte'];

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
  options('personen', 'people', 'Bautagebuch', 'Anwesende Personen', 'Auswahl im Bautagebuch, auch „Zuständig“ und „Beteiligt“', 'Person'),
  options('wetter', 'weather', 'Bautagebuch', 'Wetter', 'Auswahl im Bautagebuch', 'Wetter'),
  {
    key: 'phasen', kind: 'phases', section: 'Projekt', title: 'Phasen',
    subtitle: 'Bauphasen mit Reihenfolge und Zeitraum', singular: 'Phase',
    placeholder: 'Neue Phase …', maxLength: 80,
  },
  options('phasenstatus', 'phaseStatus', 'Projekt', 'Phasenstatus', 'Zustände einer Phase', 'Status'),
  {
    key: 'gewerke', kind: 'trades', section: 'Projekt', title: 'Gewerke',
    subtitle: 'Gewerke des Projekts', singular: 'Gewerk',
    placeholder: 'Neues Gewerk …', maxLength: 60,
  },
  options('gewerkstatus', 'tradeStatus', 'Projekt', 'Gewerkstatus', 'Zustände eines Gewerks', 'Status'),
  options('kategorien', 'costCategories', 'Kosten', 'Kategorien', 'Kostenkategorien', 'Kategorie'),
  options('zahlungsarten', 'paymentMethods', 'Kosten', 'Zahlungsarten', 'Wie bezahlt wurde', 'Zahlungsart'),
  options('bezahlt-von', 'payers', 'Kosten', 'Bezahlt von', 'Wer bezahlt hat', 'Eintrag'),
  options('zahlungsstatus', 'paymentStatus', 'Kosten', 'Zahlungsstatus', 'Zustände einer Zahlung', 'Status'),
  options('bereiche', 'taskAreas', 'Aufgaben', 'Bereiche', 'Bereiche der Aufgaben', 'Bereich'),
  options('aufgabenstatus', 'taskStatus', 'Aufgaben', 'Status', 'Zustände einer Aufgabe', 'Status'),
  options('prioritaet', 'priority', 'Aufgaben', 'Priorität', 'Auch für Gewerke', 'Priorität'),
  options('rollen', 'contactRoles', 'Kontakte', 'Rollen', 'Rollen der Kontakte', 'Rolle'),
  options('kontaktstatus', 'contactStatus', 'Kontakte', 'Status', 'Zustände eines Kontakts', 'Status'),
  options('gespraechsarten', 'contactChannels', 'Kontakte', 'Gesprächsarten', 'Art eines Gesprächsprotokolls', 'Gesprächsart'),
];

export function findPreset(key: string | undefined): PresetDef | undefined {
  return PRESETS.find((preset) => preset.key === key);
}
