import type { Phase } from '@/data/types';

/** project phases, in order; phase 2 is the one that is running */
export const SEED_PHASES: Omit<Phase, 'id'>[] = [
  { name: 'Phase 0: Kaufabwicklung', status: 'abgeschlossen', start: '2026-04-01', end: '2026-06-15', order: 0 },
  { name: 'Phase 1: Planung & Förderanträge', status: 'abgeschlossen', start: '2026-04-01', end: '2026-06-05', order: 1 },
  { name: 'Phase 2: Entkernung & Rückbau', status: 'in-arbeit', start: '2026-06-15', order: 2 },
  { name: 'Phase 3: Rohbau & Keller', status: 'geplant', order: 3 },
  { name: 'Phase 4: Dach & Fassade', status: 'geplant', order: 4 },
  { name: 'Phase 5: Haustechnik', status: 'geplant', order: 5 },
  { name: 'Phase 6: Innenausbau', status: 'geplant', order: 6 },
  { name: 'Phase 7: PV-Anlage', status: 'geplant', order: 7 },
  { name: 'Phase 8: Außenanlagen', status: 'geplant', order: 8 },
  { name: 'Phase 9: Einzug', status: 'geplant', order: 9 },
];
