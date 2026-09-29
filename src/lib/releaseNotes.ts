import raw from '../../RELEASE_NOTES.md?raw';

export interface ReleaseNote {
  version: string;
  headline: string;
  points: string[];
}

/** RELEASE_NOTES.md: `## <Version> – <Schlagzeile>` followed by bullet points, newest first */
export function parseReleaseNotes(text: string): ReleaseNote[] {
  const notes: ReleaseNote[] = [];
  let current: ReleaseNote | null = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(\S+)\s*[–-]\s*(.*)$/.exec(line);
    if (heading) {
      current = { version: heading[1], headline: heading[2].trim(), points: [] };
      notes.push(current);
    } else if (current && /^\s*[-*]\s+/.test(line)) {
      current.points.push(line.replace(/^\s*[-*]\s+/, '').trim());
    }
  }
  return notes;
}

export const RELEASE_NOTES = parseReleaseNotes(raw);
