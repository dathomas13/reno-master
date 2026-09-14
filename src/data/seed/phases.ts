import type { Phase } from '@/data/types';

/** project phases, in order; phase 2 is the one that is running */
export const SEED_PHASES: Omit<Phase, 'id'>[] = [
  { name: 'Phase 0: Kaufabwicklung', status: 'Abgeschlossen', start: '2026-04-01', end: '2026-06-15', order: 0 },
  { name: 'Phase 1: Planung & Förderanträge', status: 'Abgeschlossen', start: '2026-04-01', end: '2026-06-05', order: 1 },
  { name: 'Phase 2: Entkernung & Rückbau', status: 'In Arbeit', start: '2026-06-15', order: 2 },
  { name: 'Phase 3: Rohbau & Keller', status: 'Geplant', order: 3 },
  { name: 'Phase 4: Dach & Fassade', status: 'Geplant', order: 4 },
  { name: 'Phase 5: Haustechnik', status: 'Geplant', order: 5 },
  { name: 'Phase 6: Innenausbau', status: 'Geplant', order: 6 },
  { name: 'Phase 7: PV-Anlage', status: 'Geplant', order: 7 },
  { name: 'Phase 8: Außenanlagen', status: 'Geplant', order: 8 },
  { name: 'Phase 9: Einzug', status: 'Geplant', order: 9 },
];
