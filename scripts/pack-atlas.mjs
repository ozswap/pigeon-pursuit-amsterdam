#!/usr/bin/env node
/** @deprecated Use extract-assets.mjs — kept as alias for npm run pack-atlas */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const script = join(dirname(fileURLToPath(import.meta.url)), 'extract-assets.mjs');
const child = spawn(process.execPath, [script], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
