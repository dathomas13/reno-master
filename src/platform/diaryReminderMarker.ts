const DB_NAME = 'reno-diary-reminder';
const STORE_NAME = 'written-days';

function normalizeDate(date: string): string | null {
  const day = date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'));
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB-Transaktion abgebrochen.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB-Transaktion fehlgeschlagen.'));
  });
}

export async function rememberDiaryReminderDates(dates: readonly string[]): Promise<void> {
  const days = [...new Set(dates.map(normalizeDate).filter((date): date is string => Boolean(date)))];
  const db = await openDb();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    for (const day of days) store.put(true, day);
    await done(transaction);
  } finally {
    db.close();
  }
}

export async function rememberDiaryReminderDate(date: string): Promise<void> {
  const day = normalizeDate(date);
  if (!day) return;
  const db = await openDb();
  if (!db) return;
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(true, day);
    await done(transaction);
  } finally {
    db.close();
  }
}

export async function hasDiaryReminderDate(date: string): Promise<boolean> {
  const day = normalizeDate(date);
  if (!day) return false;
  const db = await openDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(day);
      request.onsuccess = () => resolve(request.result === true);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB-Lesen fehlgeschlagen.'));
    });
  } finally {
    db.close();
  }
}