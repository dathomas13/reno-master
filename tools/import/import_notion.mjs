/**
 * Imports the Notion export into Firestore and Cloud Storage. One off, idempotent.
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node import_notion.mjs --project reno-master [--dry-run]
 *
 * Reads the JSON files described in README.md from ./notion and matches existing rows by
 * their notionId, so running it twice updates instead of duplicating.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, 'notion');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectId = args[args.indexOf('--project') + 1];

if (!projectId || projectId.startsWith('--')) {
  console.error('Bitte --project <firebase-projekt-id> angeben.');
  process.exit(1);
}

const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');
const sharp = (await import('sharp')).default;

const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
initializeApp({
  credential: credentialPath ? cert(JSON.parse(fs.readFileSync(credentialPath, 'utf8'))) : applicationDefault(),
  projectId,
  storageBucket: `${projectId}.firebasestorage.app`,
});

const db = getFirestore();
const bucket = getStorage().bucket();
const counts = { diary: 0, photos: 0, tasks: 0, contacts: 0, costs: 0, skipped: 0 };

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

async function write(collection, id, data) {
  if (dryRun) return;
  await db.collection(collection).doc(id).set(
    { ...data, id, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

async function uploadPhoto(localPath, { entryId, costId, kind, takenAt }) {
  const absolute = path.join(dataDir, localPath);
  if (!fs.existsSync(absolute)) {
    console.log(`  Datei fehlt: ${localPath}`);
    counts.skipped += 1;
    return null;
  }
  const id = newId();
  const isPdf = absolute.toLowerCase().endsWith('.pdf');
  const storagePath = kind === 'receipt' ? `receipts/${costId}/${id}.${isPdf ? 'pdf' : 'jpg'}` : `photos/${id}.jpg`;
  const original = fs.readFileSync(absolute);

  let width = 0;
  let height = 0;
  let body = original;
  let thumbPath;

  if (!isPdf) {
    const image = sharp(original).rotate();
    const meta = await image.metadata();
    const resized = await image.resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    body = resized.data;
    width = resized.info.width;
    height = resized.info.height;
    thumbPath = `photos/${id}_thumb.jpg`;
    const thumb = await sharp(original).rotate()
      .resize({ width: 320, height: 320, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
    if (!dryRun) {
      await bucket.file(thumbPath).save(thumb, {
        contentType: 'image/jpeg',
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
    }
    void meta;
  }

  if (!dryRun) {
    await bucket.file(storagePath).save(body, {
      contentType: isPdf ? 'application/pdf' : 'image/jpeg',
      metadata: { cacheControl: 'public, max-age=31536000' },
    });
  }

  await write('photos', id, {
    kind,
    entryId: entryId ?? null,
    costId: costId ?? null,
    storagePath,
    thumbPath: thumbPath ?? null,
    contentType: isPdf ? 'application/pdf' : 'image/jpeg',
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

  const trades = await byName('trades');
  const phases = await byName('phases');
  const tradeByNotion = new Map(read('trades.json').map((row) => [row.notionId, trades.get(row.name.trim().toLowerCase())]));
  const phaseByNotion = new Map(read('phases.json').map((row) => [row.notionId, phases.get(row.name.trim().toLowerCase())]));

  // ------------------------------------------------------------ diary
  const existingDiary = await byNotionId('diary');
  for (const entry of read('diary.json')) {
    const id = existingDiary.get(entry.notionId) ?? newId();
    const photoIds = [];
    for (const photo of entry.photos ?? []) {
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
      phaseId: phaseByNotion.get(entry.phaseNotionId) ?? null,
      tradeIds: (entry.tradeNotionIds ?? []).map((n) => tradeByNotion.get(n)).filter(Boolean),
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
      tradeId: tradeByNotion.get(task.tradeNotionId) ?? null,
      phaseId: phaseByNotion.get(task.phaseNotionId) ?? null,
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
      tradeIds: (contact.tradeNotionIds ?? []).map((n) => tradeByNotion.get(n)).filter(Boolean),
      source: 'notion',
      notionId: contact.notionId,
    });
    counts.contacts += 1;
  }

  // ------------------------------------------------------------ costs
  const existingCosts = await byNotionId('costs');
  for (const cost of read('costs.json')) {
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
