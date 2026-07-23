#!/usr/bin/env node
import { copyFile, cp, mkdir, readdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SINGLE_DIR = join(ROOT, 'client/dist-single');
const SOURCE = join(SINGLE_DIR, 'index.html');
const TARGET = join(ROOT, 'dist/canal-courier.html');
const DIST = join(ROOT, 'dist');

await mkdir(DIST, { recursive: true });
await copyFile(SOURCE, TARGET);

for (const entry of await readdir(SINGLE_DIR, { withFileTypes: true })) {
  if (entry.name === 'index.html') continue;
  await cp(join(SINGLE_DIR, entry.name), join(DIST, entry.name), { recursive: true });
}

console.log(`Single-file build copied to ${TARGET}`);
