/**
 * Prüft die Teile des Workers, die sich ohne Cloudflare prüfen lassen: die Signatur der
 * Anzeige-Adressen und die Pfad-Prüfung. Node 22 bringt dieselbe Web-Crypto mit, die auch
 * im Worker läuft.
 *
 *   node worker/selftest.mjs
 */
import { sign, validSignature, validPath, verifyFirebaseToken } from './reno-files.js';

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? '  ok  ' : '  FEHLER  '} ${name}`);
  if (!ok) failed += 1;
}

const secret = 'geheim-und-lang-genug-für-hmac';
const path = 'photos/abc123.jpg';
const soon = Date.now() + 60_000;

const signature = await sign(path, soon, secret);
check('eine frisch signierte Adresse gilt', await validSignature(path, soon, signature, secret));
check('abgelaufen gilt nicht', !(await validSignature(path, Date.now() - 1000, signature, secret)));
check('anderer Pfad gilt nicht', !(await validSignature('photos/anders.jpg', soon, signature, secret)));
check('anderes Geheimnis gilt nicht', !(await validSignature(path, soon, signature, 'falsch')));
check('verfälschte Signatur gilt nicht', !(await validSignature(path, soon, signature.slice(0, -1) + '0', secret)));
check('leere Signatur gilt nicht', !(await validSignature(path, soon, '', secret)));
check('gleiche Eingabe, gleiche Signatur', (await sign(path, soon, secret)) === signature);

check('normaler Pfad ist erlaubt', validPath('photos/abc.jpg'));
check('Unterordner sind erlaubt', validPath('receipts/kosten-1/beleg.pdf'));
check('".." wird abgelehnt', !validPath('photos/../../etc/passwd'));
check('führender Schrägstrich wird abgelehnt', !validPath('/photos/abc.jpg'));
check('doppelter Schrägstrich wird abgelehnt', !validPath('photos//abc.jpg'));
check('leerer Pfad wird abgelehnt', !validPath(''));
check('Leerzeichen werden abgelehnt', !validPath('photos/mein bild.jpg'));
check('sehr lange Pfade werden abgelehnt', !validPath('a/'.repeat(120) + 'x.jpg'));

check('Unsinn ist kein Anmeldeticket', (await verifyFirebaseToken('kein.token', 'projekt')) === null);
check('leeres Anmeldeticket', (await verifyFirebaseToken('', 'projekt')) === null);
// ein selbst gebautes Ticket mit alg:none darf nicht durchgehen
const none = [
  Buffer.from(JSON.stringify({ alg: 'none', kid: 'x' })).toString('base64url'),
  Buffer.from(JSON.stringify({ aud: 'projekt', email: 'wer@auch.immer' })).toString('base64url'),
  '',
].join('.');
check('"alg: none" wird abgelehnt', (await verifyFirebaseToken(none, 'projekt')) === null);

console.log(failed === 0 ? '\nalles in Ordnung' : `\n${failed} Fehler`);
process.exit(failed ? 1 : 0);
