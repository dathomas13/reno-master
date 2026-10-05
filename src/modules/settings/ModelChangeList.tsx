const SHOWN_CHANGES = 12;

/** the change report of a built model, as shown before publishing (import and room editor) */
export function ModelChangeList({ changes, limit = SHOWN_CHANGES }: { changes: string[]; limit?: number }) {
  return (
    <ul className="list-disc pl-5 text-xs mt-2 space-y-0.5">
      {changes.slice(0, limit).map((line) => <li key={line}>{line}</li>)}
      {changes.length > limit && (
        <li className="text-muted">… und {changes.length - limit} weitere</li>
      )}
    </ul>
  );
}
