import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import {
  countByKind,
  ranges,
  search,
  snippet,
  type Range,
  type SearchHit,
  type SearchKind,
} from '@/search/engine';
import { KIND_BADGE, KIND_LABEL, KINDS } from '@/search/records';
import { useSearchIndex } from '@/search/useSearch';
import { clearRecent, loadRecent, rememberSearch } from '@/search/recent';

/** how many results one kind shows before it hands over to its own filtered list */
const PER_GROUP = 5;
/** how many the filtered list of a single kind shows at once */
const PAGE = 25;

const KIND_COLOR: Record<SearchKind, string> = {
  diary: 'text-accent border-accent/40 bg-accent/10',
  task: 'text-good border-good/40 bg-good/10',
  cost: 'text-warn border-warn/40 bg-warn/10',
  contact: 'text-ink border-line bg-panel2',
  room: 'text-ink border-line bg-panel2',
  trade: 'text-ink border-line bg-panel2',
  phase: 'text-muted border-line bg-panel2',
  plan: 'text-muted border-line bg-panel2',
  photo: 'text-muted border-line bg-panel2',
};

/** the same text with the hits wrapped in <mark> */
function Marked({ text, parts }: { text: string; parts: Range[] }) {
  if (!parts.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  parts.forEach((part, position) => {
    if (part[0] > at) out.push(text.slice(at, part[0]));
    out.push(
      <mark key={position} className="bg-accent/25 text-ink rounded-[3px] px-0.5">
        {text.slice(part[0], part[1])}
      </mark>,
    );
    at = part[1];
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

function ResultRow({ hit, onOpen }: { hit: SearchHit; onOpen(): void }) {
  const { record } = hit;
  const title = useMemo(() => ranges(record.title, hit.terms), [record.title, hit.terms]);
  const text = useMemo(
    () => (record.body ? snippet(record.body, hit.terms) : null),
    [record.body, hit.terms],
  );
  // the snippet is only worth the space when the hit is actually in the text
  const showText = text?.ranges.length ? text : null;

  return (
    <li>
      <Link to={record.to} className="list-row items-start" onClick={onOpen}>
        <span
          className={`shrink-0 mt-0.5 rounded-full border px-2 py-0.5 text-[11px] ${KIND_COLOR[record.kind]}`}
        >
          {KIND_BADGE[record.kind]}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate">
            <Marked text={record.title} parts={title} />
          </span>
          {record.subtitle && <span className="block text-xs text-muted truncate">{record.subtitle}</span>}
          {showText && (
            <span className="text-xs text-muted line-clamp-2 mt-0.5">
              <Marked text={showText.text} parts={showText.ranges} />
            </span>
          )}
        </span>
        {record.badge && <span className="shrink-0 text-xs text-muted mt-0.5">{record.badge}</span>}
      </Link>
    </li>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const { index, count, loading } = useSearchIndex();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [kind, setKind] = useState<SearchKind | null>((params.get('typ') as SearchKind) ?? null);
  const [shown, setShown] = useState(PAGE);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const input = useRef<HTMLInputElement>(null);

  // typing stays smooth: React keeps showing the old list while the new one is computed
  const needle = useDeferredValue(query);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // the query lives in the address as well, so going back from a result keeps it
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams();
      if (query.trim()) next.set('q', query.trim());
      if (kind) next.set('typ', kind);
      setParams(next, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, kind, setParams]);

  const hits = useMemo(() => search(index, needle), [index, needle]);
  const counts = useMemo(() => countByKind(hits), [hits]);
  const visible = useMemo(() => (kind ? hits.filter((hit) => hit.record.kind === kind) : hits), [hits, kind]);

  /**
   * Without a filter the results are grouped by kind. The groups come in the order of
   * their best hit - the hits are already sorted by score, so the map hands them back
   * that way by itself.
   */
  const groups = useMemo(() => {
    if (kind) return [];
    const map = new Map<SearchKind, SearchHit[]>();
    for (const hit of hits) {
      const rows = map.get(hit.record.kind);
      if (rows) rows.push(hit);
      else map.set(hit.record.kind, [hit]);
    }
    return [...map.entries()];
  }, [hits, kind]);

  useEffect(() => setShown(PAGE), [needle, kind]);

  function keep() {
    setRecent(rememberSearch(query));
  }

  return (
    <>
      <TopBar title="Suche" back="/" subtitle={count ? `${count} Einträge durchsuchbar` : undefined} />

      <div
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 bg-bg/95 backdrop-blur
                   border-b border-line"
      >
        <div className="p-3 flex gap-2">
          <div className="relative flex-1">
            <input
              ref={input}
              className="field pr-9"
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Tagebuch, Kosten, Aufgaben, Kontakte…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  keep();
                  (event.target as HTMLInputElement).blur();
                }
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Leeren"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted px-2"
                onClick={() => {
                  setQuery('');
                  input.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {hits.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-3 no-scrollbar">
            <button
              type="button"
              className={`chip shrink-0 ${kind ? '' : 'chip-on'}`}
              onClick={() => setKind(null)}
            >
              Alle {hits.length}
            </button>
            {KINDS.filter((item) => counts[item] > 0).map((item) => (
              <button
                key={item}
                type="button"
                className={`chip shrink-0 ${kind === item ? 'chip-on' : ''}`}
                onClick={() => setKind(kind === item ? null : item)}
              >
                {KIND_LABEL[item]} {counts[item]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!query.trim() && (
        <div className="p-3 flex flex-col gap-3 max-w-3xl">
          {recent.length > 0 && (
            <section className="card">
              <div className="section-title flex items-center justify-between">
                <span>Zuletzt gesucht</span>
                <button
                  type="button"
                  className="text-muted normal-case"
                  onClick={() => {
                    clearRecent();
                    setRecent([]);
                  }}
                >
                  löschen
                </button>
              </div>
              <div className="flex flex-wrap gap-2 p-4 pt-0">
                {recent.map((item) => (
                  <button key={item} type="button" className="chip" onClick={() => setQuery(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4 text-sm text-muted">
            <p className="text-ink mb-2">Was durchsucht wird</p>
            <p>
              Tagebuch mit Text und Anwesenden, Kosten und Belege samt gescanntem Beleg-Text, Aufgaben,
              Kontakte mit Notizen und Gesprächen, Gewerke, Phasen, Räume, Pläne und Fotountertitel.
            </p>
            <p className="mt-2">
              Auch Beträge (<span className="text-ink">89,90</span>), Daten (
              <span className="text-ink">13.09</span>, <span className="text-ink">September</span>) und
              Wortteile (<span className="text-ink">putz</span> findet{' '}
              <span className="text-ink">Innenputz</span>).
            </p>
          </section>

          <div className="flex flex-wrap gap-2">
            {['Mängel', 'offen', 'Angebot', 'Rechnung', 'Bad'].map((item) => (
              <button key={item} type="button" className="chip" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {query.trim() && loading && hits.length === 0 && <Spinner label="Daten werden geladen…" />}

      {query.trim() && !loading && hits.length === 0 && (
        <EmptyState title="Nichts gefunden" hint={`Kein Treffer für „${query.trim()}“.`} />
      )}

      {hits.length > 0 && visible.length === 0 && kind && (
        <EmptyState
          title={`Kein Treffer unter ${KIND_LABEL[kind]}`}
          hint={`${hits.length} Treffer gibt es woanders.`}
          action={
            <button type="button" className="btn mt-2" onClick={() => setKind(null)}>
              Alle anzeigen
            </button>
          }
        />
      )}

      {!kind &&
        groups.map(([item, rows]) => (
          <section key={item}>
            <div className="section-title">
              {KIND_LABEL[item]} · {rows.length}
            </div>
            <ul>
              {rows.slice(0, PER_GROUP).map((hit) => (
                <ResultRow key={hit.record.id} hit={hit} onOpen={keep} />
              ))}
            </ul>
            {rows.length > PER_GROUP && (
              <button
                type="button"
                className="w-full text-left px-4 py-3 text-sm text-accent border-b border-line/60"
                onClick={() => setKind(item)}
              >
                Alle {rows.length} unter {KIND_LABEL[item]} anzeigen ›
              </button>
            )}
          </section>
        ))}

      {kind && visible.length > 0 && (
        <>
          <ul>
            {visible.slice(0, shown).map((hit) => (
              <ResultRow key={hit.record.id} hit={hit} onOpen={keep} />
            ))}
          </ul>
          {visible.length > shown && (
            <div className="p-4">
              <button type="button" className="btn w-full" onClick={() => setShown(shown + PAGE)}>
                Weitere {Math.min(PAGE, visible.length - shown)} von {visible.length} anzeigen
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
