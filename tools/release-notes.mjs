/**
 * Collects the published versions, newest first, for the update banner in the app.
 *
 *   node --experimental-strip-types tools/release-notes.mjs            > dist/versions.json
 *   node --experimental-strip-types tools/release-notes.mjs --current  > dist/version.json
 *   node --experimental-strip-types tools/release-notes.mjs --text     (for the release page)
 *
 * The text comes from RELEASE_NOTES.md, not from the commit message. A commit explains a
 * change to whoever maintains the code; the banner talks to whoever uses the app, and the
 * two are not the same text. Where a version has no entry there, the commit message is
 * still used - better a technical note than none.
 *
 * The list is built from the tags of this repository rather than from the releases API,
 * so it keeps working when the repository goes private. The version being built is added
 * even though its tag does not exist yet: the release is published by the other workflow,
 * in parallel with this one.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { versionCode } from '../src/lib/version.ts';

/** how many versions back the history goes; older ones are of no interest on a phone */
const KEEP = 25;

function git(command) {
  return execSync(command, { encoding: 'utf8' }).trim();
}

/** the tags that carry a version, the ones from before the numbering are left out */
export function versionTags(all) {
  return all
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^v\d+\.\d+\.\d+$/.test(line))
    .sort((a, b) => versionCode(b.slice(1)) - versionCode(a.slice(1)));
}

/** strips the trailers; they say who wrote it, not what changed */
export function cleanNotes(body) {
  return body
    .split('\n')
    .filter((line) => !/^[A-Za-z-]+:\s*https?:/.test(line) && !/^Co-Authored-By:/.test(line))
    .join('\n')
    .trim();
}

/**
 * Reads RELEASE_NOTES.md into { version: { subject, notes } }.
 *
 *   ## 0.21.0 - Eine Suche über alles
 *   <one to three paragraphs>
 *
 * The headline after the dash is what the folded banner shows, the paragraphs are what
 * unfolds. A heading without a dash is a version with no headline; its text still counts.
 */
export function parseReleaseNotes(markdown) {
  const found = new Map();
  let version = null;
  let subject = '';
  let lines = [];

  const flush = () => {
    if (version) found.set(version, { subject, notes: lines.join('\n').trim() });
  };

  for (const line of String(markdown).split('\n')) {
    const heading = /^##\s+(\d+\.\d+\.\d+)\s*(?:[-–—:]\s*(.*))?$/.exec(line.trim());
    if (heading) {
      flush();
      version = heading[1];
      subject = (heading[2] ?? '').trim();
      lines = [];
      continue;
    }
    if (version) lines.push(line);
  }
  flush();
  return found;
}

function releaseNotesFile() {
  const path = fileURLToPath(new URL('../RELEASE_NOTES.md', import.meta.url));
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function entryFor(version, ref, written) {
  const hand = written.get(version);
  return {
    version,
    build: versionCode(version),
    date: git(`git log -1 --format=%cs ${ref}`),
    subject: hand?.subject || git(`git log -1 --format=%s ${ref}`),
    notes: hand ? hand.notes : cleanNotes(git(`git log -1 --format=%b ${ref}`)),
  };
}

function currentVersion() {
  const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));
  return String(JSON.parse(readFileSync(packageFile, 'utf8')).version);
}

function main() {
  const written = parseReleaseNotes(releaseNotesFile());
  const current = currentVersion();

  // the same words for the release on GitHub, as plain text
  if (process.argv.includes('--text')) {
    const entry = entryFor(current, 'HEAD', written);
    process.stdout.write([entry.subject, entry.notes].filter(Boolean).join('\n\n'));
    return;
  }

  // version.json: only the build that was just made, plus where its APK lives
  if (process.argv.includes('--current')) {
    const apk = process.argv[process.argv.indexOf('--apk') + 1];
    process.stdout.write(
      JSON.stringify(
        {
          ...entryFor(current, 'HEAD', written),
          sha: git('git rev-parse --short HEAD'),
          apk: apk && !apk.startsWith('--') ? apk : undefined,
        },
        null,
        2,
      ),
    );
    return;
  }

  const tags = versionTags(git('git tag'));
  const entries = [];
  // the version being built has no tag yet - the release comes from the other workflow
  if (!tags.includes(`v${current}`)) entries.push(entryFor(current, 'HEAD', written));
  for (const tag of tags) entries.push(entryFor(tag.slice(1), tag, written));

  process.stdout.write(JSON.stringify(entries.slice(0, KEEP), null, 2));
}

// importing the file for its helpers must not run it
if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) main();
