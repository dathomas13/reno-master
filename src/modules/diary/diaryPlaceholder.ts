const TEXT_PROMPTS = [
  'Was ist heute passiert?',
  'Kurzer Stand: Wer war da, was wurde erledigt, was bleibt offen?',
  'Heute festhalten: Fortschritt, Besonderheiten, Fotos',
  'Was soll in ein paar Wochen noch nachvollziehbar sein?',
  'Notizen zum Tag: Arbeitsschritte, Absprachen, Material...',
  'Was hat sich heute am Haus verändert?',
];

function dayNumber(date: string): number {
  const parts = date.slice(0, 10).split('-').map(Number);
  const [year = 1970, month = 1, day = 1] = parts;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function diaryTextPlaceholder(date: string): string {
  const index = Math.abs(dayNumber(date)) % TEXT_PROMPTS.length;
  return TEXT_PROMPTS[index] ?? TEXT_PROMPTS[0]!;
}