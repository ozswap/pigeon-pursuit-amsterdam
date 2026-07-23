#!/usr/bin/env node
/**
 * Processes raw Gemini sprite PNGs into individual frames and a Phaser atlas manifest.
 * Run: npm run pack-atlas
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'client/public/assets/raw');
const OUT = join(ROOT, 'client/public/assets/atlas');

const CYCLIST_FRAMES = [
  { name: 'spr_player_pedal_0', col: 0, row: 0 },
  { name: 'spr_player_pedal_1', col: 1, row: 0 },
  { name: 'spr_player_idle', col: 2, row: 0 },
  { name: 'spr_player_pedal_2', col: 0, row: 1 },
  { name: 'spr_player_pedal_3', col: 1, row: 1 },
  { name: 'spr_player_jump', col: 2, row: 1 },
];

async function sliceGrid(srcPath, frames, cols, rows, outPrefix) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const fw = Math.floor(w / cols);
  const fh = Math.floor(h / rows);
  const results = [];

  for (const f of frames) {
    const left = f.col * fw;
    const top = f.row * fh;
    const outPath = join(OUT, `${f.name}.png`);
    await sharp(srcPath).extract({ left, top, width: fw, height: fh }).png().toFile(outPath);
    results.push({ name: f.name, path: outPath, w: fw, h: fh });
  }
  return results;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = await readdir(RAW);
  console.log(`Found ${files.length} raw assets`);

  const cyclistFile = files.find((f) => f.includes('ca4a9e5b'));
  if (cyclistFile) {
    await sliceGrid(join(RAW, cyclistFile), CYCLIST_FRAMES, 3, 2, 'player');
    console.log('Sliced cyclist sheet');
  }

  const singles = ['pastry_stack', 'pastry_single', 'score_100', 'level_complete'];
  for (const f of files) {
    if (f.includes('__3_')) {
      await sharp(join(RAW, f)).png().toFile(join(OUT, 'spr_pastry_stack.png'));
    }
    if (f.includes('__5_')) {
      await sharp(join(RAW, f)).png().toFile(join(OUT, 'spr_pastry_single.png'));
    }
    if (f.includes('__4_')) {
      await sharp(join(RAW, f)).png().toFile(join(OUT, 'spr_score_100.png'));
    }
    if (f.includes('__6_')) {
      await sharp(join(RAW, f)).png().toFile(join(OUT, 'spr_level_complete.png'));
      const meta = await sharp(join(RAW, f)).metadata();
      const h = meta.height ?? 720;
      const layers = [
        { name: 'bg_sky', top: 0, height: Math.floor(h * 0.15) },
        { name: 'bg_skyline', top: Math.floor(h * 0.1), height: Math.floor(h * 0.2) },
        { name: 'bg_houses', top: Math.floor(h * 0.2), height: Math.floor(h * 0.25) },
        { name: 'bg_bridge', top: Math.floor(h * 0.35), height: Math.floor(h * 0.2) },
        { name: 'bg_water', top: Math.floor(h * 0.45), height: Math.floor(h * 0.15) },
        { name: 'bg_road', top: Math.floor(h * 0.55), height: Math.floor(h * 0.25) },
        { name: 'bg_foreground', top: Math.floor(h * 0.7), height: Math.floor(h * 0.3) },
      ];
      for (const layer of layers) {
        await sharp(join(RAW, f))
          .extract({ left: 0, top: layer.top, width: meta.width ?? 1280, height: layer.height })
          .png()
          .toFile(join(OUT, `${layer.name}.png`));
      }
      console.log('Extracted 7 parallax layers from level-complete art');
    }
  }

  const manifest = {
    generated: new Date().toISOString(),
    frames: CYCLIST_FRAMES.map((f) => f.name),
    parallax: ['bg_sky', 'bg_skyline', 'bg_houses', 'bg_bridge', 'bg_water', 'bg_road', 'bg_foreground'],
  };
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Atlas pack complete → client/public/assets/atlas/');
}

main().catch(console.error);
