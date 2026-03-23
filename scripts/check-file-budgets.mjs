#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

const FILE_BUDGETS = [
  ['src/app/data-loader.ts', 2400],
  ['src/app/panel-layout.ts', 1850],
  ['src/app/event-handlers.ts', 1500],
  ['src/components/MapPopup.ts', 2800],
  ['src/components/Map.ts', 3800],
  ['src/components/GlobeMap.ts', 2550],
];

const failures = [];

for (const [file, budget] of FILE_BUDGETS) {
  const source = await readFile(path.join(ROOT, file), 'utf8');
  const lineCount = source.split(/\r?\n/).length;

  if (lineCount > budget) {
    failures.push(`${file}: ${lineCount} lines exceeds budget ${budget}`);
  } else {
    console.log(`${file}: ${lineCount}/${budget}`);
  }
}

if (failures.length > 0) {
  console.error('File budget guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('File budget guard passed.');
