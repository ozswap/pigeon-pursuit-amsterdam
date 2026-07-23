#!/usr/bin/env node
import { copyFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'client/dist-single/index.html');
const TARGET = join(ROOT, 'dist/canal-courier.html');

await mkdir(dirname(TARGET), { recursive: true });
await copyFile(SOURCE, TARGET);
console.log(`Single-file build copied to ${TARGET}`);
