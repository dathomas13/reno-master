import type { Trade } from '@/data/types';

/** the 18 trades from Notion, with the Notion id kept so an import can match them */
export const SEED_TRADES: Omit<Trade, 'id'>[] = [
  { name: 'Entkernung / Rückbau', status: 'In Arbeit', priority: 'Hoch' },
  { name: 'Kellersanierung (Boden + Feuchtigkeit)', status: 'Noch offen', priority: 'Hoch' },
  { name: 'Dachsanierung (Aufdachdämmung)', status: 'Angebot einholen', priority: 'Hoch' },
  { name: 'Fassade / WDVS', status: 'Noch offen', priority: 'Hoch' },
  { name: 'Fenster & Türen', status: 'Noch offen', priority: 'Hoch' },
  { name: 'Heizung (Sole-Wasser-WP + Flächenkollektor)', status: 'Noch offen', priority: 'Hoch' },
  { name: 'Elektrik komplett', status: 'Noch offen', priority: 'Hoch' },
  { name: 'PV-Anlage (~12 kWp)', status: 'Geplant', priority: 'Hoch', budgetPlanned: 15000 },
  { name: 'Sanitär / Wasser / Abwasser', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Lüftungsanlage', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Estrich / Bodenbeläge', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Trockenbau / Innenausbau', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Fliesen (Bäder / Küche)', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Loggia-Umbau (Einhausung)', status: 'Noch offen', priority: 'Mittel' },
  { name: 'Malerarbeiten', status: 'Noch offen', priority: 'Niedrig' },
  { name: 'Innentüren', status: 'Noch offen', priority: 'Niedrig' },
  { name: 'Gaube Nordseite (optional)', status: 'Noch offen', priority: 'Niedrig' },
  { name: 'Außenanlagen (Zufahrt/Garten/Terrasse)', status: 'Noch offen', priority: 'Niedrig' },
];
