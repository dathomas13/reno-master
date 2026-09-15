/**
 * Collects the published versions, newest first, from the tags of this repository.
 *
 *   node --experimental-strip-types tools/release-notes.mjs > dist/versions.json
 *
 * The app shows everything above the version someone is running, so an update from
 * 0.9.36 to 0.17.1 tells what 0.17.0 brought as well - it is in there whether it was
 * ever installed or not.
 *
 * Built from tags rather than from the releases API, so it keeps working when the
 * repository goes private. The version being built is added even though its tag does not
 * exist yet: the release is published by the other workflow, in parallel with this one.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

function entryFor(version, ref) {
  return {
    version,
    build: versionCode(version),
    date: git(`git log -1 --format=%cs ${ref}`),
    subject: git(`git log -1 --format=%s ${ref}`),
    notes: cleanNotes(git(`git log -1 --format=%b ${ref}`)),
  };
}

function main() {
  const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));
  const current = String(JSON.parse(readFileSync(packageFile, 'utf8')).version);

  const tags = versionTags(git('git tag'));
  const entries = [];
  // the version being built has no tag yet - the release comes from the other workflow
  if (!tags.includes(`v${current}`)) entries.push(entryFor(current, 'HEAD'));
  for (const tag of tags) entries.push(entryFor(tag.slice(1), tag));

  process.stdout.write(JSON.stringify(entries.slice(0, KEEP), null, 2));
}

// importing the file for its helpers must not run it
if (process.argv[1] && process.argv[1].endsWith('release-notes.mjs')) main();
