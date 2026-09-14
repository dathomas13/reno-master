/**
 * React bindings for Firestore. Every list in the app is a live query: the local cache
 * answers immediately (also offline), the server updates arrive later.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type QueryConstraint } from 'firebase/firestore';
import { watchCollection, watchDoc } from '@/firebase/db';
import { isAuthenticated } from '@/firebase/auth';

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
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const key = useMemo(
    () => JSON.stringify([constraints.map((constraint) => constraint.type), deps]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(deps), constraints.length],
  );
  const latest = useRef(constraints);
  latest.current = constraints;

  useEffect(() => {
    // the preview runs without an account; querying would only produce denied reads
    if (!isAuthenticated()) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = watchCollection<T>(
      collectionName,
      latest.current,
      (rows) => {
        setData(rows);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [collectionName, key]);

  return { data, loading, error };
}

export function useDocument<T>(collectionName: string, id: string | undefined): {
  data: T | null;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id || !isAuthenticated()) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    return watchDoc<T>(
      collectionName,
      id,
      (row) => {
        setData(row);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err);
        setLoading(false);
      },
    );
  }, [collectionName, id]);

  return { data, loading, error };
}
