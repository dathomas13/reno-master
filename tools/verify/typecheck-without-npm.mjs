/**
 * Checks the source tree when `npm install` is impossible.
 *
 * Two things are verified, both without any third party package:
 *   1. every file parses (TypeScript compiler API, syntax diagnostics only)
 *   2. every import between our own modules resolves, and the names it imports are
 *      actually exported there
 *
 * This does not replace `tsc -b` - it catches the mistakes that do not need the real
 * types to find: typos, half finished edits, renamed exports, wrong paths.
 *
 *   node tools/verify/typecheck-without-npm.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('/opt/node22/lib/node_modules/typescript/lib/typescript.js');

const repo = process.cwd();
const roots = ['src', 'tests', 'functions/src'].map((dir) => path.join(repo, dir));

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = roots.flatMap((root) => walk(root));
const problems = [];

// ---------------------------------------------------------------- 1. syntax
const sources = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  sources.set(file, source);
  for (const diagnostic of source.parseDiagnostics ?? []) {
    const { line, character } = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    problems.push(
      `${path.relative(repo, file)}(${line + 1},${character + 1}): ` +
        ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    );
  }
}

// ---------------------------------------------------------------- 2. internal imports
function exportedNames(file) {
  const source = sources.get(file);
  const names = new Set();
  if (!source) return names;
  const visit = (node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) names.add(element.name.text);
    }
    if (ts.isExportDeclaration(node) && !node.exportClause) names.add('*'); // export * from '...'
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported) {
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (node.name && ts.isIdentifier(node.name)) {
        names.add(node.name.text);
      }
      if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) names.add('default');
    }
    if (ts.isExportAssignment(node)) names.add('default');
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return names;
}

const exportCache = new Map();
function exportsOf(file) {
  if (!exportCache.has(file)) exportCache.set(file, exportedNames(file));
  return exportCache.get(file);
}

function resolve(fromFile, specifier) {
  // Vite's ?raw / ?url suffixes load a file as text or address - no module to check
  const query = specifier.indexOf('?');
  const plain = query >= 0 ? specifier.slice(0, query) : specifier;
  if (plain !== specifier) {
    const target = plain.startsWith('@/') ? path.join(repo, 'src', plain.slice(2))
      : plain.startsWith('.') ? path.resolve(path.dirname(fromFile), plain) : null;
    return target === null || fs.existsSync(target) ? null : undefined;
  }
  let base;
  if (specifier.startsWith('@/')) base = path.join(repo, 'src', specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null; // external package, not our business here
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined; // ours, but not found
}

for (const [file, source] of sources) {
  const where = path.relative(repo, file);
  const visit = (node) => {
    const specifier =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        ? node.moduleSpecifier.text
        : null;
    if (specifier) {
      const target = resolve(file, specifier);
      if (target === undefined) {
        problems.push(`${where}: import '${specifier}' zeigt auf keine Datei`);
      } else if (target) {
        const available = exportsOf(target);
        const clause = ts.isImportDeclaration(node) ? node.importClause : node.exportClause;
        const elements =
          clause && ts.isImportClause(clause) && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
            ? clause.namedBindings.elements
            : clause && ts.isNamedExports(clause)
              ? clause.elements
              : [];
        for (const element of elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!available.has(name) && !available.has('*')) {
            problems.push(`${where}: '${name}' wird von ${path.relative(repo, target)} nicht exportiert`);
          }
        }
        if (clause && ts.isImportClause(clause) && clause.name && !available.has('default')) {
          problems.push(`${where}: ${path.relative(repo, target)} hat keinen Default-Export`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
}

if (problems.length) {
  for (const problem of problems) console.log('  ' + problem);
  console.log(`\n${problems.length} Probleme in ${files.length} Dateien`);
  process.exit(1);
}
console.log(`${files.length} Dateien: Syntax in Ordnung, alle projektinternen Importe lösen auf.`);
