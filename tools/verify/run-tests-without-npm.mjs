/**
 * Runs the vitest style unit tests with plain Node, for environments where the npm
 * registry is not reachable and `npm install` is impossible.
 *
 *   node tools/verify/run-tests-without-npm.mjs [pattern]
 *
 * It transpiles the test files and their dependency-free imports with the TypeScript
 * compiler that ships with Node tooling, rewrites the "@/..." alias to relative paths,
 * provides a minimal describe/it/expect, and reports the result.
 * The real test runner in CI is vitest - this is only a fallback.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const outDir = path.join(repo, '.tmp-node-tests');
const pattern = process.argv[2] ?? '';

const tsc = ['/opt/node22/lib/node_modules/typescript/bin/tsc', 'node_modules/typescript/bin/tsc']
  .map((p) => (path.isAbsolute(p) ? p : path.join(repo, p)))
  .find((p) => fs.existsSync(p));
if (!tsc) {
  console.error('no TypeScript compiler found');
  process.exit(1);
}

function collect(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

// only files that do not need third party modules can run here
const skip = /from '(react|react-dom|firebase|three|idb|nanoid|exifr|recharts|pdfjs-dist|@anthropic-ai|@testing-library|fake-indexeddb)|import '(@testing-library|fake-indexeddb)/;
const sources = collect(path.join(repo, 'src')).filter((file) => !skip.test(fs.readFileSync(file, 'utf8')));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// a throwaway tsconfig keeps the "@/..." alias working and lets us pick the files
const tsconfigPath = path.join(outDir, 'tsconfig.json');
fs.writeFileSync(
  tsconfigPath,
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', strict: true,
      skipLibCheck: true, outDir: '.', rootDir: path.join(repo, 'src'),
      paths: { '@/*': [path.join(repo, 'src') + '/*'] }, types: [],
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    },
    files: sources,
  }, null, 2),
);

const result = spawnSync(process.execPath, [tsc, '-p', tsconfigPath], { cwd: repo, encoding: 'utf8' });
// only errors in the files we picked matter; files pulled in transitively depend on
// packages that are not installed here and always report missing types
const picked = new Set(sources.map((file) => path.relative(repo, file)));
const relevant = (result.stdout ?? '')
  .split('\n')
  .filter((line) => line.trim())
  .filter((line) => {
    const file = /^(\S.*?)\(\d+,\d+\): error/.exec(line)?.[1];
    return file ? picked.has(file) : false;
  })
  .filter((line) => !/error TS2307|error TS2882/.test(line));
if (relevant.length) {
  console.log('TypeScript meldet:');
  for (const line of relevant) console.log('  ' + line);
  process.exit(1);
}

// rewrite the "@/..." alias to relative specifiers and add .js extensions
for (const file of collect(outDir).concat(collectJs(outDir))) {
  if (!file.endsWith('.js')) continue;
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/from '@\/([^']+)'/g, (_m, rest) => {
    const direct = path.join(outDir, rest + '.js');
    const target = fs.existsSync(direct) ? direct : path.join(outDir, rest, 'index.js');
    let rel = path.relative(path.dirname(file), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `from '${rel}'`;
  });
  code = code.replace(/from '(\.[^']+)'/g, (m, rest) => (rest.endsWith('.js') ? m : `from '${rest}.js'`));
  fs.writeFileSync(file, code);
}

function collectJs(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJs(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

// ---- minimal test framework, exposed as globals and as a fake 'vitest' module
const results = { pass: 0, fail: 0, failures: [] };
let suite = [];

function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => equal(a[k], b[k]));
}

function expect(actual) {
  return matchers(actual, false);
}

function matchers(actual, negate) {
  const where = running;
  const check = (ok, message) => {
    if (negate ? !ok : ok) results.pass++;
    else {
      results.fail++;
      results.failures.push(`${where}: ${negate ? 'nicht erwartet: ' : ''}${message}`);
    }
  };
  const api = {
    toBe: (want) => check(Object.is(actual, want), `expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`),
    toEqual: (want) => check(equal(actual, want), `expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`),
    toBeNull: () => check(actual === null, `expected null, got ${JSON.stringify(actual)}`),
    toBeUndefined: () => check(actual === undefined, `expected undefined, got ${JSON.stringify(actual)}`),
    toBeDefined: () => check(actual !== undefined, 'expected a value, got undefined'),
    toBeTruthy: () => check(Boolean(actual), `expected truthy, got ${JSON.stringify(actual)}`),
    toBeFalsy: () => check(!actual, `expected falsy, got ${JSON.stringify(actual)}`),
    toContain: (want) => check(actual?.includes?.(want), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(want)}`),
    toBeCloseTo: (want, digits = 2) =>
      check(Math.abs(actual - want) < Math.pow(10, -digits) / 2, `expected ~${want}, got ${actual}`),
    toBeGreaterThan: (want) => check(actual > want, `expected > ${want}, got ${actual}`),
    toBeLessThan: (want) => check(actual < want, `expected < ${want}, got ${actual}`),
    toHaveLength: (want) => check(actual?.length === want, `expected length ${want}, got ${actual?.length}`),
    // spies, so a test can state what was not done either
    toHaveBeenCalled: () => check((actual?.mock?.calls.length ?? 0) > 0, 'expected the function to be called'),
    toHaveBeenCalledTimes: (want) =>
      check(actual?.mock?.calls.length === want, `expected ${want} calls, got ${actual?.mock?.calls.length}`),
    toHaveBeenCalledWith: (...want) =>
      check(
        (actual?.mock?.calls ?? []).some((call) => equal(call, want)),
        `expected a call with ${JSON.stringify(want)}, got ${JSON.stringify(actual?.mock?.calls)}`,
      ),
    toThrow: () => {
      try {
        actual();
        check(false, 'expected it to throw');
      } catch {
        check(true, '');
      }
    },
  };

  // await expect(promise).rejects.toThrow()
  api.rejects = {
    toThrow: async () => {
      try {
        await actual;
        check(false, 'expected the promise to reject');
      } catch {
        check(true, '');
      }
    },
  };
  api.resolves = {
    toBe: async (want) => {
      const value = await actual;
      check(Object.is(value, want), `expected ${JSON.stringify(want)}, got ${JSON.stringify(value)}`);
    },
  };

  if (!negate) api.not = matchers(actual, true);
  return api;
}

const describe = (name, fn) => { suite.push(name); fn(); suite.pop(); };

/**
 * Tests are collected while the files are imported and run afterwards, one after the
 * other. Running them right away meant an async test was never awaited: it looked green
 * whatever it asserted, because nothing waited for its assertions. Running them in order
 * also keeps the name of the failing test attached to the failure.
 */
const tests = [];
const it = (name, fn) => {
  tests.push({ where: [...suite, name].join(' › '), fn });
};

/** the test whose assertions are being counted right now */
let running = '';

/** just enough of vitest's spies to say what was called */
const vi = {
  fn: (implementation = () => undefined) => {
    const calls = [];
    const spy = (...args) => {
      calls.push(args);
      return implementation(...args);
    };
    spy.mock = { calls };
    return spy;
  },
};

Object.assign(globalThis, { describe, it, test: it, expect, vi, beforeEach: (fn) => fn() });

// the constants Vite injects at build time
Object.assign(globalThis, {
  __APP_VERSION__: '0.9.0',
  __APP_BUILD__: 0,
  __APP_SHA__: 'test',
  __BUILD_DATE__: '2026-01-01',
});

// make `import { describe } from 'vitest'` resolve
const shimDir = path.join(outDir, 'node_modules', 'vitest');
fs.mkdirSync(shimDir, { recursive: true });
fs.writeFileSync(path.join(shimDir, 'package.json'), JSON.stringify({ name: 'vitest', type: 'module', main: 'index.js' }));
fs.writeFileSync(
  path.join(shimDir, 'index.js'),
  'export const describe = globalThis.describe;\nexport const it = globalThis.it;\nexport const test = globalThis.it;\nexport const expect = globalThis.expect;\nexport const vi = globalThis.vi;\nexport const beforeEach = globalThis.beforeEach;\n',
);

const testFiles = collectJs(outDir).filter((f) => /\.test\.js$/.test(f) && f.includes(pattern));
for (const file of testFiles) await import(pathToFileURL(file).href);

for (const test of tests) {
  running = test.where;
  try {
    await test.fn();
  } catch (error) {
    results.fail++;
    results.failures.push(`${test.where}: threw ${error}`);
  }
}

console.log(`\n${results.pass} passed, ${results.fail} failed  (${testFiles.length} Dateien)`);
for (const failure of results.failures) console.log('  ✗ ' + failure);
process.exit(results.fail ? 1 : 0);
