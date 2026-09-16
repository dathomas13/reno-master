/**
 * Imports the Notion export into Firestore and the file store on Cloudflare R2.
 * One off, idempotent.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export FILES_URL=https://reno-files.<konto>.workers.dev
 *   export FIREBASE_API_KEY=<der Wert von VITE_FIREBASE_API_KEY>
 *   export IMPORT_USER_EMAIL=<eine der beiden freigeschalteten Adressen>
 *   node import_notion.mjs --project reno-master [--dry-run] [--wipe-diary]
 *
 * Reads the JSON files described in README.md from ./notion and matches existing rows by
 * their notionId, so running it twice updates instead of duplicating.
 *
 * Files do not go through the Admin SDK: the bucket is R2 behind worker/reno-files.js,
 * which only knows Firebase login tickets. So the script mints a custom token for one of
 * the allowed accounts and trades it for an id token, exactly like the app does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'notion');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wipeDiary = args.includes('--wipe-diary');
const projectId = args[args.indexOf('--project') + 1];

if (!projectId || projectId.startsWith('--')) {
  console.error('Bitte --project <firebase-projekt-id> angeben.');
  process.exit(1);
}

const filesUrl = String(process.env.FILES_URL ?? '').replace(/\/$/, '');
const apiKey = process.env.FIREBASE_API_KEY ?? '';
const userEmail = process.env.IMPORT_USER_EMAIL ?? '';

const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
const sharp = (await import('sharp')).default;

const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp({
  credential: credentialPath ? cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) : applicationDefault(),
  projectId,
});

const db = getFirestore();
const counts = { diary: 0, photos: 0, unchanged: 0, tasks: 0, contacts: 0, costs: 0, deleted: 0, skipped: 0 };

const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
function newId(length = 12) {
  let id = '';
  for (let i = 0; i < length; i += 1) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
}

function read(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    console.log(`  ${name} fehlt - übersprungen`);
    return [];
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ---------------------------------------------------------------- Dateispeicher

/** an id token for one of the accounts the worker lets through; good for an hour */
let ticketCache = { at: 0, token: '' };

async function ticket() {
  if (ticketCache.token && Date.now() - ticketCache.at < 45 * 60 * 1000) return ticketCache.token;

  const user = await getAuth().getUserByEmail(userEmail);
  const customToken = await getAuth().createCustomToken(user.uid);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!response.ok) {
    throw new Error(`Anmeldung am Dateispeicher fehlgeschlagen (${response.status}): ${await response.text()}`);
  }
  const { idToken } = await response.json();
  ticketCache = { at: Date.now(), token: idToken };
  return idToken;
}

function fileUrl(storagePath) {
  return `${filesUrl}/files/${storagePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function putFile(storagePath, body, contentType) {
  if (dryRun) return;
  const response = await fetch(fileUrl(storagePath), {
    method: 'PUT',
    headers: { authorization: `Bearer ${await ticket()}`, 'content-type': contentType },
    body,
  });
  if (!response.ok) {
    throw new Error(`Hochladen von ${storagePath} fehlgeschlagen (${response.status}): ${await response.text()}`);
  }
}

async function deleteFile(storagePath) {
  if (dryRun || !storagePath) return;
  await fetch(fileUrl(storagePath), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${await ticket()}` },
  });
}

/**
 * Refuses before the first write instead of halfway through: an import that puts entries
 * into Firestore but loses the photos is worse than one that never started.
 */
function checkFileStore(fileCount) {
  if (fileCount === 0) return;
  const missing = [
    !filesUrl && 'FILES_URL',
    !apiKey && 'FIREBASE_API_KEY',
    !userEmail && 'IMPORT_USER_EMAIL',
  ].filter(Boolean);
  if (missing.length > 0) {
    console.error(
      `Für ${fileCount} Dateien fehlt die Einrichtung des Dateispeichers: ${missing.join(', ')}.\n` +
      'Siehe worker/README.md. Ohne Fotos importieren geht mit einer diary.json ohne "photos".',
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------- Firestore

async function write(collection, id, data) {
  if (dryRun) return;
  await db.collection(collection).doc(id).set(
    { ...data, id, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** existing documents of a collection, keyed by notionId */
async function byNotionId(collection) {
  const snapshot = await db.collection(collection).where('source', '==', 'notion').get();
  const map = new Map();
  for (const doc of snapshot.docs) {
    const id = doc.get('notionId');
    if (id) map.set(id, doc.id);
  }
  return map;
}

/** name to id, for resolving trade and phase relations */
async function byName(collection) {
  const snapshot = await db.collection(collection).get();
  const map = new Map();
  for (const doc of snapshot.docs) map.set(String(doc.get('name')).trim().toLowerCase(), doc.id);
  return map;
}

/**
 * Which photos already hang on an entry, by their original file name. Without this a
 * second run would upload every picture again and leave the first copies behind as
 * documents no entry points to.
 */
async function photosByEntry() {
  const snapshot = await db.collection('photos').where('kind', '==', 'photo').get();
  const map = new Map();
  for (const doc of snapshot.docs) {
    const entryId = doc.get('entryId');
    const name = doc.get('originalName');
    if (!entryId || !name) continue;
    if (!map.has(entryId)) map.set(entryId, new Map());
    map.get(entryId).set(name, doc.id);
  }
  return map;
}

/**
 * Relations are matched by name, so a phase or trade that is not in Firestore yet would
 * quietly drop off the entry. Say so instead: the fix is to start the app once, which
 * writes the seed data, and run the import again.
 */
function relation(map, notionId, kind, where) {
  if (!notionId) return null;
  const id = map.get(notionId);
  if (!id) console.log(`  ${kind} ${notionId} nicht zugeordnet (${where}) - bleibt leer`);
  return id ?? null;
}

/**
 * Empties the diary, including the photos that hang on its entries and their files.
 * Without the photos the entries would be gone but their pictures would stay behind as
 * documents nothing points to.
 */
async function wipe() {
  const entries = await db.collection('diary').get();
  const photos = await db.collection('photos').where('kind', '==', 'photo').get();
  const orphans = photos.docs.filter((doc) => doc.get('entryId'));

  console.log(`  Tagebuch leeren: ${entries.size} Einträge, ${orphans.length} Fotos`);
  if (dryRun) return;

  for (const doc of orphans) {
    await deleteFile(doc.get('storagePath'));
    await deleteFile(doc.get('thumbPath'));
    await deleteFile(doc.get('originalPath'));
    await doc.ref.delete();
    counts.deleted += 1;
  }
  for (const doc of entries.docs) {
    await doc.ref.delete();
    counts.deleted += 1;
  }
}

// ---------------------------------------------------------------- Fotos

/**
 * Uploads one picture three times over: the untouched original, so nothing of the day is
 * lost; a 1600-px copy for the app; a thumbnail for the lists. Receipts can also be PDFs,
 * those go up as they are.
 */
async function uploadPhoto(localPath, { entryId, costId, kind, takenAt }) {
  const absolute = path.join(dataDir, localPath);
  if (!fs.existsSync(absolute)) {
    console.log(`  Datei fehlt: ${localPath}`);
    counts.skipped += 1;
    return null;
  }
  const id = newId();
  const isPdf = absolute.toLowerCase().endsWith('.pdf');
  const extension = isPdf ? 'pdf' : 'jpg';
  const storagePath = kind === 'receipt' ? `receipts/${costId}/${id}.${extension}` : `photos/${id}.${extension}`;
  const contentType = isPdf ? 'application/pdf' : 'image/jpeg';
  const original = fs.readFileSync(absolute);

  let width = 0;
  let height = 0;
  let body = original;
  let thumbPath = null;
  let originalPath = null;

  if (!isPdf) {
    const maxEdge = kind === 'receipt' ? 2000 : 1600;
    const resized = await sharp(original).rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    body = resized.data;
    width = resized.info.width;
    height = resized.info.height;

    thumbPath = `photos/${id}_thumb.jpg`;
    const thumb = await sharp(original).rotate()
      .resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    await putFile(thumbPath, thumb, 'image/jpeg');

    // die unveränderte Datei, damit die Originalqualität erhalten bleibt
    originalPath = `photos/${id}_original.${path.extname(absolute).slice(1).toLowerCase() || 'jpg'}`;
    await putFile(originalPath, original, contentType);
  }

  await putFile(storagePath, body, contentType);

  await write('photos', id, {
    kind,
    entryId: entryId ?? null,
    costId: costId ?? null,
    storagePath,
    thumbPath,
    originalPath,
    contentType,
    width,
    height,
    bytes: body.length,
    originalName: path.basename(absolute),
    originalBytes: original.length,
    takenAt: takenAt ?? null,
    roomIds: [],
    uploadState: 'uploaded',
    source: 'notion',
  });
  counts.photos += 1;
  return id;
}

async function run() {
  console.log(`Import nach ${projectId}${dryRun ? ' (Trockenlauf)' : ''}\n`);

  const diaryRows = read('diary.json');
  const costRows = read('costs.json');
  const fileCount =
    diaryRows.reduce((sum, entry) => sum + (entry.photos ?? []).length, 0) +
    costRows.reduce((sum, cost) => sum + (cost.receipts ?? []).length, 0);
  checkFileStore(fileCount);

  if (wipeDiary) await wipe();

  const trades = await byName('trades');
  const phases = await byName('phases');
  const tradeByNotion = new Map(read('trades.json').map((row) => [row.notionId, trades.get(row.name.trim().toLowerCase())]));
  const phaseByNotion = new Map(read('phases.json').map((row) => [row.notionId, phases.get(row.name.trim().toLowerCase())]));

  // ------------------------------------------------------------ diary
  const existingDiary = wipeDiary ? new Map() : await byNotionId('diary');
  const existingPhotos = wipeDiary ? new Map() : await photosByEntry();
  for (const entry of diaryRows) {
    const id = existingDiary.get(entry.notionId) ?? newId();
    const known = existingPhotos.get(id) ?? new Map();
    const photoIds = [];
    for (const photo of entry.photos ?? []) {
      const knownId = known.get(path.basename(photo.file));
      if (knownId) {
        photoIds.push(knownId);
        counts.unchanged += 1;
        continue;
      }
      const photoId = await uploadPhoto(photo.file, { entryId: id, kind: 'photo', takenAt: photo.takenAt });
      if (photoId) photoIds.push(photoId);
    }
    await write('diary', id, {
      date: entry.date,
      title: entry.title ?? `Tagebuch ${entry.date}`,
      text: entry.text ?? '',
      weather: entry.weather ?? null,
      present: entry.present ?? [],
      defects: Boolean(entry.defects),
      phaseId: relation(phaseByNotion, entry.phaseNotionId, 'Phase', entry.title),
      tradeIds: (entry.tradeNotionIds ?? [])
        .map((n) => relation(tradeByNotion, n, 'Gewerk', entry.title))
        .filter(Boolean),
      roomIds: [],
      photoIds,
      source: 'notion',
      notionId: entry.notionId,
    });
    counts.diary += 1;
  }

  // ------------------------------------------------------------ tasks
  const existingTasks = await byNotionId('tasks');
  for (const task of read('tasks.json')) {
    const id = existingTasks.get(task.notionId) ?? newId();
    await write('tasks', id, {
      title: task.title,
      notes: task.notes ?? '',
      status: task.status ?? 'Offen',
      priority: task.priority ?? 'Mittel',
      due: task.due ?? null,
      assignees: task.assignees ?? [],
      area: task.area ?? null,
      tradeId: relation(tradeByNotion, task.tradeNotionId, 'Gewerk', task.title),
      phaseId: relation(phaseByNotion, task.phaseNotionId, 'Phase', task.title),
      roomIds: [],
      source: 'notion',
      notionId: task.notionId,
    });
    counts.tasks += 1;
  }

  // ------------------------------------------------------------ contacts
  const existingContacts = await byNotionId('contacts');
  for (const contact of read('contacts.json')) {
    const id = existingContacts.get(contact.notionId) ?? newId();
    await write('contacts', id, {
      name: contact.name,
      company: contact.company ?? '',
      role: contact.role ?? null,
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      status: contact.status ?? null,
      rating: contact.rating ?? null,
      notes: contact.notes ?? '',
      tradeIds: (contact.tradeNotionIds ?? [])
        .map((n) => relation(tradeByNotion, n, 'Gewerk', contact.name))
        .filter(Boolean),
      source: 'notion',
      notionId: contact.notionId,
    });
    counts.contacts += 1;
  }

  // ------------------------------------------------------------ costs
  const existingCosts = await byNotionId('costs');
  for (const cost of costRows) {
    const id = existingCosts.get(cost.notionId) ?? newId();
    const receiptIds = [];
    for (const receipt of cost.receipts ?? []) {
      const photoId = await uploadPhoto(receipt, { costId: id, kind: 'receipt' });
      if (photoId) receiptIds.push(photoId);
    }
    await write('costs', id, {
      date: cost.date,
      vendor: cost.vendor ?? '',
      description: cost.description ?? '',
      amountGross: Number(cost.amountGross ?? 0),
      category: cost.category ?? '',
      roomIds: [],
      paymentStatus: cost.paymentStatus ?? 'bezahlt',
      receiptPhotoIds: receiptIds,
      notes: cost.notes ?? '',
      source: 'notion',
      notionId: cost.notionId,
    });
    counts.costs += 1;
  }

  console.log('\nErgebnis:');
  for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
  if (dryRun) console.log('\nTrockenlauf – es wurde nichts geschrieben.');
}

await run();
