import type { Trade } from '@/data/types';

/** the 18 trades of the project, in the order they were planned; status and priority are option ids */
export const SEED_TRADES: Omit<Trade, 'id'>[] = [
  { name: 'Entkernung / Rückbau', status: 'in-arbeit', priority: 'hoch' },
  { name: 'Kellersanierung (Boden + Feuchtigkeit)', status: 'noch-offen', priority: 'hoch' },
  { name: 'Dachsanierung (Aufdachdämmung)', status: 'angebot-einholen', priority: 'hoch' },
  { name: 'Fassade / WDVS', status: 'noch-offen', priority: 'hoch' },
  { name: 'Fenster & Türen', status: 'noch-offen', priority: 'hoch' },
  { name: 'Heizung (Sole-Wasser-WP + Flächenkollektor)', status: 'noch-offen', priority: 'hoch' },
  { name: 'Elektrik komplett', status: 'noch-offen', priority: 'hoch' },
  { name: 'PV-Anlage (~12 kWp)', status: 'geplant', priority: 'hoch', budgetPlanned: 15000 },
  { name: 'Sanitär / Wasser / Abwasser', status: 'noch-offen', priority: 'mittel' },
  { name: 'Lüftungsanlage', status: 'noch-offen', priority: 'mittel' },
  { name: 'Estrich / Bodenbeläge', status: 'noch-offen', priority: 'mittel' },
  { name: 'Trockenbau / Innenausbau', status: 'noch-offen', priority: 'mittel' },
  { name: 'Fliesen (Bäder / Küche)', status: 'noch-offen', priority: 'mittel' },
  { name: 'Loggia-Umbau (Einhausung)', status: 'noch-offen', priority: 'mittel' },
  { name: 'Malerarbeiten', status: 'noch-offen', priority: 'niedrig' },
  { name: 'Innentüren', status: 'noch-offen', priority: 'niedrig' },
  { name: 'Gaube Nordseite (optional)', status: 'noch-offen', priority: 'niedrig' },
  { name: 'Außenanlagen (Zufahrt/Garten/Terrasse)', status: 'noch-offen', priority: 'niedrig' },
];
