#!/usr/bin/env node
/**
 * Extracts transparent sprite frames and parallax strips from raw Gemini PNGs.
 * Run: npm run extract-assets
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'client/public/assets/raw');
const OUT = join(ROOT, 'client/public/assets/sprites');

const CYCLIST_FRAMES = [
  { name: 'spr_player_pedal_0', col: 0, row: 0 },
  { name: 'spr_player_pedal_1', col: 1, row: 0 },
  { name: 'spr_player_idle', col: 2, row: 0 },
  { name: 'spr_player_pedal_2', col: 0, row: 1 },
  { name: 'spr_player_pedal_3', col: 1, row: 1 },
  { name: 'spr_player_jump', col: 2, row: 1 },
];

const PIGEON_CELLS = [
  { name: 'spr_pigeon_0', col: 0, row: 0 },
  { name: 'spr_pigeon_1', col: 1, row: 0 },
  { name: 'spr_pigeon_2', col: 2, row: 0 },
  { name: 'spr_pigeon_3', col: 0, row: 1 },
  { name: 'spr_pigeon_4', col: 2, row: 1 },
];

const SMOKE_FRAMES = Array.from({ length: 6 }, (_, i) => ({
  name: `spr_smoke_${i}`,
  col: i % 3,
  row: Math.floor(i / 3),
}));

/** Character-free building strip from the level art (left side, below text). */
async function extractParallax(srcPath) {
  const outPath = join(OUT, 'bg_scene.png');
  await sharp(srcPath)
    .extract({ left: 0, top: 248, width: 520, height: 100 })
    .png()
    .toFile(outPath);
  return ['bg_scene'];
}

function findFile(files, pattern) {
  return files.find((f) => pattern.test(f));
}

function detectBackground(data, width, height, channels) {
  const samples = [];
  const points = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
  ];

  for (const [x, y] of points) {
    const i = (y * width + x) * channels;
    samples.push([data[i], data[i + 1], data[i + 2]]);
  }

  return samples
    .reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0])
    .map((v) => Math.round(v / samples.length));
}

function colorClose(a, b, tolerance) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
}

/** Flood-fill from image edges — removes background without punching interior holes. */
function floodRemoveBackground(data, width, height, channels, bg, tolerance) {
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let x = 0; x < width; x++) {
    queue.push([x, 0], [x, height - 1]);
  }
  for (let y = 1; y < height - 1; y++) {
    queue.push([0, y], [width - 1, y]);
  }

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const i = idx * channels;
    const pixel = [data[i], data[i + 1], data[i + 2]];
    if (!colorClose(pixel, bg, tolerance)) continue;

    data[i + 3] = 0;

    if (x > 0) queue.push([x - 1, y]);
    if (x < width - 1) queue.push([x + 1, y]);
    if (y > 0) queue.push([x, y - 1]);
    if (y < height - 1) queue.push([x, y + 1]);
  }
}

/** Remove halos adjacent to transparent pixels without punching interior holes. */
function despillFringe(data, width, height, channels, bg, tolerance, passes = 4) {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = Buffer.from(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const i = idx * channels;
        if (snapshot[i + 3] < 20) continue;
        const pixel = [snapshot[i], snapshot[i + 1], snapshot[i + 2]];
        if (!colorClose(pixel, bg, tolerance)) continue;

        let nearTransparent = false;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          const ni = (ny * width + nx) * channels;
          if (snapshot[ni + 3] < 20) {
            nearTransparent = true;
            break;
          }
        }
        if (nearTransparent) data[i + 3] = 0;
      }
    }
  }
}

async function loadRaw(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), info };
}

async function saveTransparentPng(data, info, outPath, tolerance = 38) {
  const { width, height, channels } = info;
  const bg = detectBackground(data, width, height, channels);
  floodRemoveBackground(data, width, height, channels, bg, tolerance);
  despillFringe(data, width, height, channels, bg, Math.max(12, tolerance - 6));
  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 8 })
    .png()
    .toFile(outPath);
}

async function extractCell(srcPath, col, row, cols, rows, outPath, tolerance) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const fw = Math.floor(w / cols);
  const fh = Math.floor(h / rows);
  const inset = Math.max(2, Math.floor(Math.min(fw, fh) * 0.015));
  const left = col * fw + inset;
  const top = row * fh + inset;
  const cellW = fw - inset * 2;
  const cellH = fh - inset * 2;

  const { data, info } = await sharp(srcPath)
    .extract({ left, top, width: cellW, height: cellH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  await saveTransparentPng(data, info, outPath, tolerance);
  return { name: outPath.split('/').pop().replace('.png', ''), w: cellW, h: cellH };
}

async function extractSingle(srcPath, outName, tolerance = 38) {
  const outPath = join(OUT, `${outName}.png`);
  const { data, info } = await loadRaw(srcPath);
  await saveTransparentPng(data, info, outPath, tolerance);
  return outName;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = await readdir(RAW);
  console.log(`Processing ${files.length} raw assets → ${OUT}`);

  const manifest = {
    generated: new Date().toISOString(),
    player: [],
    pigeons: [],
    smoke: [],
    singles: [],
    parallax: [],
  };

  const cyclistFile = findFile(files, /rl2cnerl2cnerl2c-(?!__)/);
  if (cyclistFile) {
    for (const frame of CYCLIST_FRAMES) {
      const outPath = join(OUT, `${frame.name}.png`);
      const result = await extractCell(
        join(RAW, cyclistFile),
        frame.col,
        frame.row,
        3,
        2,
        outPath,
        48,
      );
      manifest.player.push(result.name);
    }
    console.log(`Cyclist: 6 frames from ${cyclistFile} (1024×576 → 3×2 grid)`);
  }

  const pigeonFile = findFile(files, /rl2cnerl2cnerl2c__1_/);
  if (pigeonFile) {
    for (const cell of PIGEON_CELLS) {
      const outPath = join(OUT, `${cell.name}.png`);
      await extractCell(join(RAW, pigeonFile), cell.col, cell.row, 3, 2, outPath, 22);
      manifest.pigeons.push(cell.name);
    }
    console.log(`Pigeons: 5 frames from ${pigeonFile}`);
  }

  const smokeFile = findFile(files, /miqebhmiqebhmiqe__2_/);
  if (smokeFile) {
    for (const frame of SMOKE_FRAMES) {
      const outPath = join(OUT, `${frame.name}.png`);
      await extractCell(join(RAW, smokeFile), frame.col, frame.row, 3, 2, outPath, 40);
      manifest.smoke.push(frame.name);
    }
    console.log(`Smoke: 6 frames from ${smokeFile}`);
  }

  const singles = [
    { pattern: /rl2cnerl2cnerl2c__3_/, name: 'spr_pastry_stack', tolerance: 18 },
    { pattern: /rl2cnerl2cnerl2c__4_/, name: 'spr_score_100', tolerance: 22 },
    { pattern: /rl2cnerl2cnerl2c__5_/, name: 'spr_pastry_single', tolerance: 22 },
    { pattern: /rl2cnerl2cnerl2c__6_/, name: 'spr_level_complete', tolerance: 18 },
    { pattern: /miqebhmiqebhmiqe__1_/, name: 'spr_telegraph_arrow', tolerance: 40 },
    { pattern: /miqebhmiqebhmiqe__3_/, name: 'spr_fence_tile', tolerance: 35 },
  ];

  for (const spec of singles) {
    const file = findFile(files, spec.pattern);
    if (file) {
      manifest.singles.push(await extractSingle(join(RAW, file), spec.name, spec.tolerance));
      console.log(`Single: ${spec.name} from ${file}`);
    }
  }

  const levelFile = findFile(files, /rl2cnerl2cnerl2c__6_/);
  if (levelFile) {
    manifest.parallax = await extractParallax(join(RAW, levelFile));
    console.log(`Parallax: ${manifest.parallax.length} scene layers from ${levelFile}`);
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Asset extraction complete → client/public/assets/sprites/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
