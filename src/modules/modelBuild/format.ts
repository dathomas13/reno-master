/**
 * The canonical text layout of a house file - identical to format_source in
 * tools/model/hausdatei.py, so a file written by the app and one written by Python do
 * not differ in a single byte.
 *
 * Short values stay on one line; a record of plain values always stays on one line,
 * however long (one wall, one opening, one room per line reads and diffs best); a record
 * that also holds lists puts its plain values on one leading line and each list below.
 */
const LINE = 140;

function isScalar(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (v !== null && typeof v === 'object') return Object.keys(v).length === 0;
  return true;
}

function compact(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(compact).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`).join(', ')}}`;
  }
  return JSON.stringify(v);
}

function layout(v: unknown, indent: number): string {
  const flat = compact(v);
  if (isScalar(v) || (indent > 0 && indent + flat.length <= LINE)) return flat;
  const pad = ' '.repeat(indent + 2);
  const end = `\n${' '.repeat(indent)}`;
  if (Array.isArray(v)) return `[\n${v.map((x) => pad + layout(x, indent + 2)).join(',\n')}${end}]`;
  const entries = Object.entries(v as Record<string, unknown>);
  if (indent > 0 && entries.every(([, x]) => isScalar(x))) return flat;
  const head = entries.filter(([, x]) => isScalar(x)).map(([k, x]) => `${JSON.stringify(k)}: ${compact(x)}`);
  const lines = indent === 0 ? head.map((h) => pad + h) : head.length > 0 ? [pad + head.join(', ')] : [];
  for (const [k, x] of entries) {
    if (!isScalar(x)) lines.push(`${pad}${JSON.stringify(k)}: ${layout(x, indent + 2)}`);
  }
  return `{\n${lines.join(',\n')}${end}}`;
}

export function formatSource(doc: Record<string, unknown>): string {
  return `${layout(doc, 0)}\n`;
}
