#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src/app', 'src/utils', 'src/services'];
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);
const MATCHERS = [
  { label: 'innerHTML assignment', regex: /\binnerHTML\s*=/g },
  { label: 'insertAdjacentHTML', regex: /\.insertAdjacentHTML\s*\(/g },
  { label: 'outerHTML assignment', regex: /\bouterHTML\s*=/g },
];

const ALLOWED_MATCH_COUNTS = new Map([
  ['src/app/event-handlers.ts', 2],
  ['src/app/panel-layout.ts', 2],
  ['src/services/preferences-content.ts', 2],
  ['src/utils/dom-utils.ts', 2],
  ['src/utils/export.ts', 1],
]);

async function collectFiles(dir) {
  const entries = await readdir(path.join(ROOT, dir), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(relPath));
      continue;
    }

    if (TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(relPath.replace(/\\/g, '/'));
    }
  }

  return files;
}

function countMatches(source) {
  return MATCHERS.reduce((total, matcher) => total + [...source.matchAll(matcher.regex)].length, 0);
}

const files = (await Promise.all(TARGET_DIRS.map(collectFiles))).flat().sort();
const violations = [];

for (const file of files) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const count = countMatches(source);
  const allowed = ALLOWED_MATCH_COUNTS.get(file);

  if (count === 0) {
    if (allowed) {
      violations.push(`${file}: expected ${allowed} raw DOM HTML operation(s), found 0`);
    }
    continue;
  }

  if (allowed == null) {
    violations.push(`${file}: found ${count} unexpected raw DOM HTML operation(s)`);
    continue;
  }

  if (count !== allowed) {
    violations.push(`${file}: expected ${allowed} raw DOM HTML operation(s), found ${count}`);
  }
}

for (const [file, allowed] of ALLOWED_MATCH_COUNTS) {
  if (!files.includes(file)) {
    violations.push(`${file}: allowlist entry no longer matches a tracked source file`);
    continue;
  }
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const count = countMatches(source);
  if (count !== allowed && !violations.some((violation) => violation.startsWith(`${file}:`))) {
    violations.push(`${file}: expected ${allowed} raw DOM HTML operation(s), found ${count}`);
  }
}

if (violations.length > 0) {
  console.error('Unsafe DOM guard failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Unsafe DOM guard passed for ${files.length} files.`);
