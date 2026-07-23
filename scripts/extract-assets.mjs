#!/usr/bin/env node
/**
 * Extract transparent sprites + parallax strips from raw Gemini PNGs.
 * Run: npm run extract-assets
 *
 * Output: client/public/assets/sprites/*.png (individual PNGs only)
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile, rm } from 'fs/promises';
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

function findFile(files, pattern) {
  return files.find((f) => pattern.test(f));
}

function colorDist(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function colorClose(a, b, tolerance) {
  return colorDist(a, b) <= tolerance;
}

function detectBackground(data, width, height, channels) {
  const samples = [];
  const margin = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 8))) {
    samples.push([x, 0], [x, height - 1]);
  }
  for (let y = margin; y < height - margin; y += Math.max(1, Math.floor(height / 8))) {
    samples.push([0, y], [width - 1, y]);
  }

  const colors = [];
  for (const [x, y] of samples) {
    const i = (y * width + x) * channels;
    colors.push([data[i], data[i + 1], data[i + 2]]);
  }

  // Most common near-edge color wins (handles slight gradient backgrounds)
  const buckets = new Map();
  for (const c of colors) {
    const key = c.map((v) => Math.round(v / 8) * 8).join(',');
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  let bestKey = colors[0].map((v) => Math.round(v / 8) * 8).join(',');
  let bestCount = 0;
  for (const [key, count] of buckets) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }
  return bestKey.split(',').map(Number);
}

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

function saturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : ((max - min) / max) * 255;
}

function despillFringe(data, width, height, channels, bg, tolerance, passes = 8) {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = Buffer.from(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const i = idx * channels;
        if (snapshot[i + 3] < 20) continue;
        const r = snapshot[i];
        const g = snapshot[i + 1];
        const b = snapshot[i + 2];
        const pixel = [r, g, b];
        const lowSat = saturation(r, g, b) < 40;
        const nearBg = colorClose(pixel, bg, tolerance) || (lowSat && (r + g + b) / 3 > 85 && (r + g + b) / 3 < 210);
        if (!nearBg) continue;

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

/** Second pass: remove neutral fringe pixels touching transparency. */
function removeNeutralFringe(data, width, height, channels, passes = 6) {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = Buffer.from(data);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const i = idx * channels;
        if (snapshot[i + 3] < 20) continue;
        const sat = saturation(snapshot[i], snapshot[i + 1], snapshot[i + 2]);
        if (sat > 45) continue;

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

async function saveTransparentPng(data, info, outPath, tolerance = 42, skipNeutralFringe = false) {
  const { width, height, channels } = info;
  const bg = detectBackground(data, width, height, channels);
  floodRemoveBackground(data, width, height, channels, bg, tolerance);
  despillFringe(data, width, height, channels, bg, Math.max(18, tolerance - 6));
  if (!skipNeutralFringe) removeNeutralFringe(data, width, height, channels);

  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  return { w: meta.width ?? width, h: meta.height ?? height };
}

async function extractCell(srcPath, col, row, cols, rows, outPath, tolerance, skipNeutralFringe = false) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const fw = Math.floor(w / cols);
  const fh = Math.floor(h / rows);
  const inset = Math.max(4, Math.floor(Math.min(fw, fh) * 0.04));
  const left = col * fw + inset;
  const top = row * fh + inset;
  const cellW = fw - inset * 2;
  const cellH = fh - inset * 2;

  const { data, info } = await sharp(srcPath)
    .extract({ left, top, width: cellW, height: cellH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const bg = detectBackground(data, width, height, channels);
  floodRemoveBackground(data, width, height, channels, bg, tolerance);
  despillFringe(data, width, height, channels, bg, Math.max(18, tolerance - 6));
  if (!skipNeutralFringe) removeNeutralFringe(data, width, height, channels);

  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const meta2 = await sharp(outPath).metadata();
  return { w: meta2.width ?? width, h: meta2.height ?? height };
}

async function extractSingle(srcPath, outName, tolerance = 42, skipNeutralFringe = false) {
  const outPath = join(OUT, `${outName}.png`);
  const { data, info } = await loadRaw(srcPath);
  await saveTransparentPng(data, info, outPath, tolerance, skipNeutralFringe);
  return outName;
}

/** Horizontal scenery strips from level-complete art — left scene only, no UI text. */
async function extractParallaxStrips(srcPath) {
  const names = [];
  const sceneW = 480;

  await sharp(srcPath)
    .extract({ left: 0, top: 118, width: sceneW, height: 58 })
    .resize(640, 42, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(join(OUT, 'bg_buildings.png'));
  names.push('bg_buildings');

  await sharp(srcPath)
    .extract({ left: 0, top: 268, width: sceneW, height: 52 })
    .resize(640, 34, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(join(OUT, 'bg_canal.png'));
  names.push('bg_canal');

  await sharp(srcPath)
    .extract({ left: 0, top: 430, width: sceneW, height: 44 })
    .resize(640, 30, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(join(OUT, 'bg_path.png'));
  names.push('bg_path');

  return names;
}

/** Tileable fence strip from fence sprite sheet. */
async function extractFenceTile(srcPath) {
  const outPath = join(OUT, 'spr_fence_tile.png');
  // Bottom third of fence art — horizontal railing tiles well
  await sharp(srcPath)
    .extract({ left: 0, top: 300, width: 1024, height: 120 })
    .resize(320, 38, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(outPath);
  return 'spr_fence_tile';
}

/** Compact level-complete banner (not full scene). */
async function extractLevelCompleteBanner(srcPath) {
  const outPath = join(OUT, 'spr_level_complete.png');
  const { data, info } = await sharp(srcPath)
    .extract({ left: 280, top: 20, width: 464, height: 120 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Remove white header background
  const bg = [255, 255, 255];
  floodRemoveBackground(data, info.width, info.height, info.channels, bg, 35);
  despillFringe(data, info.width, info.height, info.channels, bg, 20);

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize(280, 72, { kernel: sharp.kernel.nearest })
    .png()
    .toFile(outPath);

  return 'spr_level_complete';
}

async function verifySprite(name) {
  const path = join(OUT, `${name}.png`);
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let transparent = 0;
  let opaqueGrey = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) transparent++;
    else if (
      data[i + 3] > 200 &&
      Math.abs(data[i] - data[i + 1]) < 12 &&
      Math.abs(data[i + 1] - data[i + 2]) < 12 &&
      data[i] > 110 &&
      data[i] < 190
    ) {
      opaqueGrey++;
    }
  }
  const tPct = ((transparent / total) * 100).toFixed(1);
  const gPct = ((opaqueGrey / total) * 100).toFixed(1);
  if (name.startsWith('spr_') && parseFloat(gPct) > 8) {
    console.warn(`  ⚠ ${name}: ${info.width}x${info.height}, grey=${gPct}%`);
  } else {
    console.log(`  ✓ ${name}: ${info.width}x${info.height}, transparent=${tPct}%`);
  }
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const files = await readdir(RAW);
  console.log(`Processing ${files.length} raw assets → ${OUT}\n`);

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
      await extractCell(join(RAW, cyclistFile), frame.col, frame.row, 3, 2, outPath, 55);
      manifest.player.push(frame.name);
    }
    console.log(`Cyclist: 6 frames from ${cyclistFile}`);
  }

  const pigeonFile = findFile(files, /rl2cnerl2cnerl2c__1_/);
  if (pigeonFile) {
    for (const cell of PIGEON_CELLS) {
      const outPath = join(OUT, `${cell.name}.png`);
      await extractCell(join(RAW, pigeonFile), cell.col, cell.row, 3, 2, outPath, 55);
      manifest.pigeons.push(cell.name);
    }
    console.log(`Pigeons: 5 frames from ${pigeonFile}`);
  }

  const smokeFile = findFile(files, /miqebhmiqebhmiqe__2_/);
  if (smokeFile) {
    for (const frame of SMOKE_FRAMES) {
      const outPath = join(OUT, `${frame.name}.png`);
      await extractCell(join(RAW, smokeFile), frame.col, frame.row, 3, 2, outPath, 45, true);
      manifest.smoke.push(frame.name);
    }
    console.log(`Smoke: 6 frames from ${smokeFile}`);
  }

  const singles = [
    { pattern: /rl2cnerl2cnerl2c__3_/, name: 'spr_pastry_stack', tolerance: 32, skipNeutralFringe: true },
    { pattern: /rl2cnerl2cnerl2c__4_/, name: 'spr_score_100', tolerance: 38, skipNeutralFringe: true },
    { pattern: /rl2cnerl2cnerl2c__5_/, name: 'spr_pastry_single', tolerance: 38, skipNeutralFringe: true },
  ];

  for (const spec of singles) {
    const file = findFile(files, spec.pattern);
    if (file) {
      manifest.singles.push(
        await extractSingle(join(RAW, file), spec.name, spec.tolerance, spec.skipNeutralFringe),
      );
      console.log(`Single: ${spec.name}`);
    }
  }

  const arrowFile = findFile(files, /miqebhmiqebhmiqe__1_/);
  if (arrowFile) {
    const outPath = join(OUT, 'spr_telegraph_arrow.png');
    const { data, info } = await sharp(join(RAW, arrowFile))
      .extract({ left: 362, top: 80, width: 300, height: 400 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    await saveTransparentPng(data, info, outPath, 55);
    manifest.singles.push('spr_telegraph_arrow');
    console.log('Single: spr_telegraph_arrow (cropped)');
  }

  const levelFile = findFile(files, /rl2cnerl2cnerl2c__6_/);
  if (levelFile) {
    manifest.parallax = await extractParallaxStrips(join(RAW, levelFile));
    manifest.singles.push(await extractLevelCompleteBanner(join(RAW, levelFile)));
    console.log(`Parallax: ${manifest.parallax.join(', ')}`);
    console.log('Level banner: spr_level_complete');
  }

  const fenceFile = findFile(files, /miqebhmiqebhmiqe__3_/);
  if (fenceFile) {
    manifest.singles.push(await extractFenceTile(join(RAW, fenceFile)));
    console.log('Fence tile: spr_fence_tile');
  }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\nVerification:');
  const allSprites = [
    ...manifest.player,
    ...manifest.pigeons,
    ...manifest.smoke,
    ...manifest.singles,
    ...manifest.parallax,
  ];
  for (const name of allSprites) await verifySprite(name);

  console.log('\nAsset extraction complete → client/public/assets/sprites/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
