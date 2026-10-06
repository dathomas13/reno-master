/**
 * React bindings for Firestore. Every list in the app is a live query: the local cache
 * answers immediately (also offline), the server updates arrive later.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { type QueryConstraint } from 'firebase/firestore';
import { watchCollection, watchDoc } from '@/firebase/db';
import { currentUid, watchUser } from '@/firebase/auth';

const subscribeAuth = (onChange: () => void) => watchUser(() => onChange());

/**
 * Who is signed in, as React state.
 *
 * After a restart Firebase restores the session a moment after the first render. A query
 * that looked at the account only once, at mount, found nobody, answered "empty, done" and
 * never asked again - for everything mounted before the session was back. The evening
 * reminder is mounted that early, so it planned every day as if the diary were empty and
 * brought back the alarm for a day that had its entry (0.75.1). The subscriptions below
 * therefore start over whenever the account changes.
 */
function useSignedInUid(): string | null {
  return useSyncExternalStore(subscribeAuth, currentUid, () => null);
}

export interface QueryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
}

/**
 * Live query.
 *
 * `deps` says when the query itself changed. Firestore constraints are rebuilt on every
 * render and carry no readable value, so a query that filters on something dynamic (an
 * entry id, a room id) has to name that value here - otherwise the subscription would
 * keep listening for the previous one.
 */
export function useCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = [],
): QueryResult<T> {
  const uid = useSignedInUid();
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);
  // which subscription the current data came from; anything else still counts as loading
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = useMemo(
    () => JSON.stringify([constraints.map((constraint) => constraint.type), deps]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(deps), constraints.length],
  );
  const subscription = `${uid ?? ''}|${collectionName}|${key}`;
  const latest = useRef(constraints);
  latest.current = constraints;

  useEffect(() => {
    // the preview runs without an account; querying would only produce denied reads
    if (!uid) {
      setData([]);
      setError(null);
      setLoadedFor(subscription);
      return;
    }
    const unsubscribe = watchCollection<T>(
      collectionName,
      latest.current,
      (rows) => {
        setData(rows);
        setError(null);
        setLoadedFor(subscription);
      },
      (err) => {
        setError(err);
        setLoadedFor(subscription);
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription]);

  return { data, loading: loadedFor !== subscription, error };
}

export function useDocument<T>(collectionName: string, id: string | undefined): {
  data: T | null;
  loading: boolean;
  error: Error | null;
} {
  const uid = useSignedInUid();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const subscription = `${uid ?? ''}|${collectionName}|${id ?? ''}`;

  useEffect(() => {
    if (!id || !uid) {
      setData(null);
      setError(null);
      setLoadedFor(subscription);
      return;
    }
    return watchDoc<T>(
      collectionName,
      id,
      (row) => {
        setData(row);
        setError(null);
        setLoadedFor(subscription);
      },
      (err) => {
        setError(err);
        setLoadedFor(subscription);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription]);

  // without an id there is nothing to wait for, also on the very first render
  return { data, loading: Boolean(id) && loadedFor !== subscription, error };
}
