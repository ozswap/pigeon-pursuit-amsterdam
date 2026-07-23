#!/usr/bin/env node
/**
 * Extract transparent sprites + parallax strips from raw Gemini PNGs.
 * Run: npm run extract-assets
 *
 * Output: client/public/assets/sprites/*.png (individual PNGs only)
 */
import sharp from 'sharp';
import { readdir, mkdir, writeFile, rm, open, unlink } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const LOCK = join(dirname(fileURLToPath(import.meta.url)), '../tmp/extract-assets.lock');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RAW = join(ROOT, 'client/public/assets/raw');
const OUT = join(ROOT, 'client/public/assets/sprites');

/** Level-complete layout: left panel = game scene; x ≥ 304 is UI / LEVEL COMPLETE text. */
const SCENE_W = 304;

/** Sampled from hazy sky in level-complete left panel — keep in sync with config SKY_COLOR. */
const SKY_COLOR_RGB = [105, 110, 146];

/** Tight per-frame crops from cyclist sheet — avoids neighbor bleed & Gemini stray caps. */
const CYCLIST_REGIONS = [
  { name: 'spr_player_pedal_0', left: 12, top: 12, width: 318, height: 268 },
  { name: 'spr_player_pedal_1', left: 358, top: 12, width: 296, height: 248 },
  { name: 'spr_player_idle', left: 698, top: 12, width: 314, height: 268 },
  { name: 'spr_player_pedal_2', left: 12, top: 300, width: 318, height: 262 },
  { name: 'spr_player_pedal_3', left: 358, top: 300, width: 296, height: 248 },
  { name: 'spr_player_jump', left: 698, top: 288, width: 314, height: 278 },
];

/** Tight crops from pigeon sheet (center cell is player — skipped). */
const PIGEON_REGIONS = [
  { name: 'spr_pigeon_0', left: 51, top: 20, width: 278, height: 223 },
  // Center-top: cyclist below bleeds upward — crop height to flying pigeon only
  { name: 'spr_pigeon_1', left: 371, top: 27, width: 311, height: 155 },
  { name: 'spr_pigeon_2', left: 713, top: 62, width: 265, height: 155 },
  { name: 'spr_pigeon_3', left: 67, top: 288, width: 256, height: 213 },
  { name: 'spr_pigeon_4', left: 761, top: 320, width: 207, height: 204 },
];

/** Per-frame smoke crops — sparse dissipate frames need lower orphan threshold. */
const SMOKE_REGIONS = [
  { name: 'spr_smoke_0', left: 132, top: 103, width: 77, height: 76, orphanMin: 8 },
  { name: 'spr_smoke_1', left: 452, top: 82, width: 120, height: 118, orphanMin: 8 },
  { name: 'spr_smoke_2', left: 764, top: 56, width: 170, height: 165, orphanMin: 8 },
  { name: 'spr_smoke_3', left: 82, top: 324, width: 178, height: 182, orphanMin: 6 },
  { name: 'spr_smoke_4', left: 414, top: 316, width: 195, height: 190, orphanMin: 4 },
  { name: 'spr_smoke_5', left: 773, top: 337, width: 161, height: 157, orphanMin: 3 },
];

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

function luminance(r, g, b) {
  return (r + g + b) / 3;
}

/** True when a pixel looks like background bleed (grey, teal, or lavender fringe). */
function isBackgroundLike(r, g, b, bg, tolerance) {
  const dist = colorDist([r, g, b], bg);
  if (dist <= tolerance) return true;

  const sat = saturation(r, g, b);
  const lum = luminance(r, g, b);
  const bgLum = luminance(bg[0], bg[1], bg[2]);

  // Neutral anti-alias fringe between sprite and flat background
  if (sat < 42 && lum > 70 && lum < 230 && Math.abs(lum - bgLum) <= tolerance * 1.15) {
    return true;
  }

  // Teal / lavender spill common in Gemini PNG backgrounds
  if (b > r + 6 && g > r + 2 && sat < 70 && lum > 75 && lum < 245 && dist <= tolerance + 28) {
    return true;
  }

  return false;
}

/**
 * Edge-only halo cleanup: removes background-colored pixels touching transparency
 * without eating colorful interior sprite pixels.
 */
function cleanEdgeHalos(data, width, height, channels, bg, tolerance, passes = 10, smoke = false) {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = Buffer.from(data);
    let changed = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const i = idx * channels;
        const a = snapshot[i + 3];
        if (a < 5) continue;

        const r = snapshot[i];
        const g = snapshot[i + 1];
        const b = snapshot[i + 2];
        const sat = saturation(r, g, b);
        const lum = luminance(r, g, b);
        const bgLum = luminance(bg[0], bg[1], bg[2]);

        // Smoke VFX: keep bright neutral puffs; only strip lavender/grey bg bleed
        if (smoke && sat < 30 && lum > bgLum + 18) continue;

        let transparentNeighbors = 0;
        let colorfulOpaqueNeighbors = 0;

        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            transparentNeighbors++;
            continue;
          }
          const ni = (ny * width + nx) * channels;
          const na = snapshot[ni + 3];
          if (na < 20) transparentNeighbors++;
          else if (na > 160 && saturation(snapshot[ni], snapshot[ni + 1], snapshot[ni + 2]) > 48) {
            colorfulOpaqueNeighbors++;
          }
        }

        if (transparentNeighbors === 0) continue;

        // Keep clearly colorful edge pixels that belong to the sprite
        if (sat > 58 && colorfulOpaqueNeighbors >= 2) continue;

        const softTolerance = tolerance + (a < 220 ? 18 : 8);
        if (isBackgroundLike(r, g, b, bg, softTolerance)) {
          data[i + 3] = 0;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }
}

/** Drop opaque pixels below the main sprite's feet (Gemini stray caps / debris). */
function trimBelowMainBounds(data, width, height, channels, pad = 3) {
  const bounds = getContentBounds(data, width, height);
  const floorY = Math.min(height - 1, bounds.maxY + pad);
  for (let y = floorY + 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[(y * width + x) * channels + 3] = 0;
    }
  }
}

/** Remove Gemini stray caps / sparkle debris in the bottom strip of a cell. */
function removeBottomStrayBlobs(data, width, height, channels, stripRatio = 0.14, maxBlob = 800) {
  const stripTop = Math.floor(height * (1 - stripRatio));
  const visited = new Uint8Array(width * height);
  const idx = (x, y) => y * width + x;

  for (let y = stripTop; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = idx(x, y);
      if (visited[id] || data[id * channels + 3] < 20) {
        visited[id] = 1;
        continue;
      }

      const component = [];
      const queue = [[x, y]];
      visited[id] = 1;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        component.push([cx, cy]);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nid = idx(nx, ny);
          if (visited[nid] || data[nid * channels + 3] < 20) continue;
          visited[nid] = 1;
          queue.push([nx, ny]);
        }
      }

      if (component.length <= maxBlob) {
        for (const [cx, cy] of component) {
          data[idx(cx, cy) * channels + 3] = 0;
        }
      }
    }
  }
}

/** Keep only the largest opaque blob — drops duplicate heads / sparkle debris. */
function keepLargestComponent(data, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const idx = (x, y) => y * width + x;
  let largest = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = idx(x, y);
      if (visited[id] || data[id * channels + 3] < 20) {
        visited[id] = 1;
        continue;
      }

      const component = [];
      const queue = [[x, y]];
      visited[id] = 1;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        component.push([cx, cy]);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nid = idx(nx, ny);
          if (visited[nid] || data[nid * channels + 3] < 20) continue;
          visited[nid] = 1;
          queue.push([nx, ny]);
        }
      }

      if (component.length > largest.length) largest = component;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y) * channels;
      if (data[i + 3] < 20) continue;
      const inLargest = largest.some(([cx, cy]) => cx === x && cy === y);
      if (!inLargest) data[i + 3] = 0;
    }
  }
}

/** Drop tiny disconnected opaque clusters (orphan background specks). */
function removeOrphanSpecks(data, width, height, channels, minSize = 10) {
  const visited = new Uint8Array(width * height);
  const idx = (x, y) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = idx(x, y);
      if (visited[id]) continue;
      if (data[id * channels + 3] < 20) {
        visited[id] = 1;
        continue;
      }

      const component = [];
      const queue = [[x, y]];
      visited[id] = 1;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop();
        component.push([cx, cy]);
        for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nid = idx(nx, ny);
          if (visited[nid]) continue;
          if (data[nid * channels + 3] < 20) continue;
          visited[nid] = 1;
          queue.push([nx, ny]);
        }
      }

      if (component.length < minSize) {
        for (const [cx, cy] of component) {
          data[idx(cx, cy) * channels + 3] = 0;
        }
      }
    }
  }
}

function isVoidPixel(r, g, b, threshold = 28) {
  return r + g + b < threshold;
}

/** Fill letterbox / panel-edge black voids so strips tile without bars or text bleed. */
function repairParallaxPixels(data, width, height, channels, { skyColor, skyFillRatio = 0.35 }) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!isVoidPixel(r, g, b)) continue;

      if (y < height * skyFillRatio) {
        data[i] = skyColor[0];
        data[i + 1] = skyColor[1];
        data[i + 2] = skyColor[2];
        continue;
      }

      let filled = false;
      for (const nx of [x - 1, x + 1, x - 2, x + 2, x - 3, x + 3]) {
        if (nx < 0 || nx >= width) continue;
        const ni = (y * width + nx) * channels;
        if (isVoidPixel(data[ni], data[ni + 1], data[ni + 2])) continue;
        data[i] = data[ni];
        data[i + 1] = data[ni + 1];
        data[i + 2] = data[ni + 2];
        filled = true;
        break;
      }
      if (!filled) {
        data[i] = skyColor[0];
        data[i + 1] = skyColor[1];
        data[i + 2] = skyColor[2];
      }
      if (channels === 4) data[i + 3] = 255;
    }
  }
}

/** Cross-fade edge columns so TileSprite loops without a visible seam. */
function blendHorizontalSeams(data, width, height, channels, blendPx = 4) {
  for (let y = 0; y < height; y++) {
    for (let dx = 0; dx < blendPx; dx++) {
      const leftIdx = (y * width + dx) * channels;
      const rightIdx = (y * width + (width - blendPx + dx)) * channels;
      const t = (dx + 0.5) / blendPx;
      for (let c = 0; c < 3; c++) {
        const mixed = Math.round(data[leftIdx + c] * (1 - t) + data[rightIdx + c] * t);
        data[leftIdx + c] = mixed;
        data[rightIdx + c] = mixed;
      }
    }
  }
}

async function extractParallaxStrip(srcPath, region, outPath, outW, outH, repairOpts) {
  const { data, info } = await sharp(srcPath)
    .extract(region)
    .resize(outW, outH, { kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  repairParallaxPixels(data, info.width, info.height, info.channels, repairOpts);
  blendHorizontalSeams(data, info.width, info.height, info.channels);
  await saveRawPng(data, info.width, info.height, outPath);
}

async function saveRawPng(data, width, height, outPath) {
  await sharp(data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

function processTransparency(data, width, height, channels, bg, tolerance, { orphanMin = 10, smoke = false, fillEnclosedBg = false } = {}) {
  floodRemoveBackground(data, width, height, channels, bg, tolerance);
  if (fillEnclosedBg) removeAllBackgroundColored(data, width, height, channels, bg, Math.max(14, tolerance - 10));
  cleanEdgeHalos(data, width, height, channels, bg, Math.max(16, tolerance - 4), 10, smoke);
  removeOrphanSpecks(data, width, height, channels, orphanMin);
}

/** Remove bg-colored pixels everywhere (for enclosed holes like bagel centers). */
function removeAllBackgroundColored(data, width, height, channels, bg, tolerance) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i + 3] < 20) continue;
      const pixel = [data[i], data[i + 1], data[i + 2]];
      if (colorClose(pixel, bg, tolerance)) data[i + 3] = 0;
    }
  }
}

/** Re-run edge halo cleanup on an already-keyed PNG (e.g. after frame normalization). */
async function refineEdgesOnDisk(filePath, tolerance = 22) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = detectBackground(data, info.width, info.height, info.channels);
  cleanEdgeHalos(data, info.width, info.height, info.channels, bg, tolerance);
  await saveRawPng(data, info.width, info.height, filePath);
}

async function loadRaw(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), info };
}

async function saveTransparentPng(data, info, outPath, tolerance = 42, options = {}) {
  const { width, height, channels } = info;
  const bg = detectBackground(data, width, height, channels);
  processTransparency(data, width, height, channels, bg, tolerance, options);
  if (options.keepLargest) keepLargestComponent(data, width, height, channels);

  await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  return { w: meta.width ?? width, h: meta.height ?? height };
}

/** Opaque pixel bounding box (alpha > 20). */
function getContentBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= 20) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * Pad all frames in a group onto a shared canvas with bottom-center alignment
 * so texture swaps do not pop vertically or horizontally.
 */
async function normalizeFrameGroup(frameNames, label) {
  const frames = [];
  for (const name of frameNames) {
    const path = join(OUT, `${name}.png`);
    try {
      await sharp(path).metadata();
    } catch {
      console.warn(`  ⚠ skip normalize — missing ${name}`);
      continue;
    }
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = getContentBounds(data, info.width, info.height);
    const w = bounds.maxX - bounds.minX + 1;
    const h = bounds.maxY - bounds.minY + 1;
    frames.push({ name, data, info, bounds, w, h });
  }

  const pad = 2;
  const maxW = Math.max(...frames.map((f) => f.w));
  const maxH = Math.max(...frames.map((f) => f.h));
  const canvasW = maxW + pad * 2;
  const canvasH = maxH + pad * 2;

  for (const frame of frames) {
    const canvas = Buffer.alloc(canvasW * canvasH * 4, 0);
    const destX = pad + Math.floor((maxW - frame.w) / 2);
    const destY = pad + (maxH - frame.h);

    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const srcIdx = ((frame.bounds.minY + y) * frame.info.width + (frame.bounds.minX + x)) * 4;
        const dstIdx = ((destY + y) * canvasW + (destX + x)) * 4;
        canvas[dstIdx] = frame.data[srcIdx];
        canvas[dstIdx + 1] = frame.data[srcIdx + 1];
        canvas[dstIdx + 2] = frame.data[srcIdx + 2];
        canvas[dstIdx + 3] = frame.data[srcIdx + 3];
      }
    }

    await sharp(canvas, { raw: { width: canvasW, height: canvasH, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, `${frame.name}.png`));
  }

  console.log(`  Normalized ${label} → ${canvasW}x${canvasH} (bottom-aligned)`);
  return { w: canvasW, h: canvasH };
}

/** Center-align pigeon poses on one canvas so animation swaps do not pop. */
async function normalizePigeonFrames(frameNames) {
  const frames = [];
  for (const name of frameNames) {
    const path = join(OUT, `${name}.png`);
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = getContentBounds(data, info.width, info.height);
    const w = bounds.maxX - bounds.minX + 1;
    const h = bounds.maxY - bounds.minY + 1;
    frames.push({ name, data, info, bounds, w, h });
  }

  const pad = 2;
  const maxW = Math.max(...frames.map((f) => f.w));
  const maxH = Math.max(...frames.map((f) => f.h));
  const canvasW = maxW + pad * 2;
  const canvasH = maxH + pad * 2;

  for (const frame of frames) {
    const canvas = Buffer.alloc(canvasW * canvasH * 4, 0);
    const destX = pad + Math.floor((maxW - frame.w) / 2);
    const destY = pad + Math.floor((maxH - frame.h) / 2);

    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const srcIdx = ((frame.bounds.minY + y) * frame.info.width + (frame.bounds.minX + x)) * 4;
        const dstIdx = ((destY + y) * canvasW + (destX + x)) * 4;
        canvas[dstIdx] = frame.data[srcIdx];
        canvas[dstIdx + 1] = frame.data[srcIdx + 1];
        canvas[dstIdx + 2] = frame.data[srcIdx + 2];
        canvas[dstIdx + 3] = frame.data[srcIdx + 3];
      }
    }

    await sharp(canvas, { raw: { width: canvasW, height: canvasH, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, `${frame.name}.png`));
  }

  console.log(`  Normalized pigeon frames → ${canvasW}x${canvasH} (center-aligned)`);
}

/** Center-align smoke VFX frames for stable origin during playback. */
async function normalizeSmokeFrames(frameNames) {
  const frames = [];
  for (const name of frameNames) {
    const path = join(OUT, `${name}.png`);
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bounds = getContentBounds(data, info.width, info.height);
    const w = bounds.maxX - bounds.minX + 1;
    const h = bounds.maxY - bounds.minY + 1;
    frames.push({ name, data, info, bounds, w, h });
  }

  const pad = 4;
  const maxW = Math.max(...frames.map((f) => f.w));
  const maxH = Math.max(...frames.map((f) => f.h));
  const canvasW = maxW + pad * 2;
  const canvasH = maxH + pad * 2;

  for (const frame of frames) {
    const canvas = Buffer.alloc(canvasW * canvasH * 4, 0);
    const destX = pad + Math.floor((maxW - frame.w) / 2);
    const destY = pad + Math.floor((maxH - frame.h) / 2);

    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const srcIdx = ((frame.bounds.minY + y) * frame.info.width + (frame.bounds.minX + x)) * 4;
        const dstIdx = ((destY + y) * canvasW + (destX + x)) * 4;
        canvas[dstIdx] = frame.data[srcIdx];
        canvas[dstIdx + 1] = frame.data[srcIdx + 1];
        canvas[dstIdx + 2] = frame.data[srcIdx + 2];
        canvas[dstIdx + 3] = frame.data[srcIdx + 3];
      }
    }

    await sharp(canvas, { raw: { width: canvasW, height: canvasH, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, `${frame.name}.png`));
  }

  console.log(`  Normalized smoke frames → ${canvasW}x${canvasH} (center-aligned)`);
}

/** Bagel stack only — crop rack/shadow, tighter key, resize for in-game cargo. */
async function extractPastryStack(srcPath) {
  const outPath = join(OUT, 'spr_pastry_stack.png');
  // Tighter crop: bagels only, exclude V-shaped rack triangle at base
  const { data, info } = await sharp(srcPath)
    .extract({ left: 290, top: 40, width: 450, height: 340 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, 24, { orphanMin: 8 });

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize(180, 160, { fit: 'inside', kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return 'spr_pastry_stack';
}

/** Compact single bagel pickup. */
async function extractPastrySingle(srcPath) {
  const outPath = join(OUT, 'spr_pastry_single.png');
  const { data, info } = await loadRaw(srcPath);
  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, 32, { fillEnclosedBg: true });

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize(48, 48, { fit: 'inside', kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return 'spr_pastry_single';
}

async function extractCell(srcPath, col, row, cols, rows, outPath, tolerance, options = {}) {
  const meta = await sharp(srcPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const fw = Math.floor(w / cols);
  const fh = Math.floor(h / rows);
  const insetPct = options.insetPct ?? 0.10;
  const inset = Math.max(8, Math.floor(Math.min(fw, fh) * insetPct));
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
  processTransparency(data, width, height, channels, bg, tolerance, options);

  const bounds = getContentBounds(data, width, height);
  const hasContent = bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY;
  const pipeline = sharp(data, { raw: { width, height, channels: 4 } });
  if (hasContent) pipeline.trim({ threshold: 10 });

  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);

  const meta2 = await sharp(outPath).metadata();
  return { w: meta2.width ?? width, h: meta2.height ?? height };
}

async function extractRegion(srcPath, region, outPath, tolerance, options = {}) {
  const { left, top, width, height } = region;
  const { data, info } = await sharp(srcPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, tolerance, options);
  if (options.keepLargest) keepLargestComponent(data, info.width, info.height, info.channels);

  const bounds = getContentBounds(data, info.width, info.height);
  const hasContent = bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY;
  const pipeline = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (hasContent) pipeline.trim({ threshold: options.trimThreshold ?? 8 });

  await pipeline.png({ compressionLevel: 9 }).toFile(outPath);
}

/** Green telegraph arrow — tight crop + saturation boost for in-game visibility. */
async function extractTelegraphArrow(srcPath) {
  const outPath = join(OUT, 'spr_telegraph_arrow.png');
  const { data, info } = await sharp(srcPath)
    .extract({ left: 349, top: 85, width: 325, height: 384 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Cyan sheet background — key explicitly before edge halo pass
  const bg = [176, 214, 238];
  processTransparency(data, info.width, info.height, info.channels, bg, 36, { orphanMin: 6 });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue;
    if (data[i + 1] > data[i] + 8 && data[i + 1] > data[i + 2] + 4) {
      data[i + 1] = Math.min(255, data[i + 1] + 18);
      data[i] = Math.max(0, data[i] - 10);
      data[i + 2] = Math.max(0, data[i + 2] - 10);
    }
  }

  const bounds = getContentBounds(data, info.width, info.height);
  const cropW = bounds.maxX - bounds.minX + 1;
  const cropH = bounds.maxY - bounds.minY + 1;
  const cropped = Buffer.alloc(cropW * cropH * 4, 0);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const srcIdx = ((bounds.minY + y) * info.width + (bounds.minX + x)) * 4;
      const dstIdx = (y * cropW + x) * 4;
      cropped[dstIdx] = data[srcIdx];
      cropped[dstIdx + 1] = data[srcIdx + 1];
      cropped[dstIdx + 2] = data[srcIdx + 2];
      cropped[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  await sharp(cropped, { raw: { width: cropW, height: cropH, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return 'spr_telegraph_arrow';
}

async function extractSingle(srcPath, outName, tolerance = 42, options = {}) {
  const outPath = join(OUT, `${outName}.png`);
  const { data, info } = await loadRaw(srcPath);
  await saveTransparentPng(data, info, outPath, tolerance, options);
  return outName;
}

/** Horizontal scenery strips from level-complete left panel — no UI / LEVEL COMPLETE text. */
async function extractParallaxStrips(srcPath) {
  const names = [];
  const sky = { skyColor: SKY_COLOR_RGB };

  await extractParallaxStrip(
    srcPath,
    { left: 0, top: 125, width: SCENE_W, height: 50 },
    join(OUT, 'bg_buildings.png'),
    640,
    42,
    { ...sky, skyFillRatio: 0.45 },
  );
  names.push('bg_buildings');

  await extractParallaxStrip(
    srcPath,
    { left: 0, top: 255, width: SCENE_W, height: 52 },
    join(OUT, 'bg_canal.png'),
    640,
    34,
    { ...sky, skyFillRatio: 0.12 },
  );
  names.push('bg_canal');

  await extractParallaxStrip(
    srcPath,
    { left: 0, top: 428, width: SCENE_W, height: 40 },
    join(OUT, 'bg_path.png'),
    640,
    30,
    { ...sky, skyFillRatio: 0.05 },
  );
  names.push('bg_path');

  return names;
}

/** Tileable fence strip — horizontal rails from fence sprite sheet. */
/** Tileable fence strip — keyed transparent PNG (not opaque beige band). */
async function extractFenceTile(srcPath) {
  const outPath = join(OUT, 'spr_fence_tile.png');
  const { data, info } = await sharp(srcPath)
    .extract({ left: 0, top: 300, width: 1024, height: 120 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, 40, { orphanMin: 12 });

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(320, 38, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return 'spr_fence_tile';
}

/** +100 score popup — crop glyph, key dark-grey bg, resize for 320×180 HUD. */
async function extractScore100(srcPath) {
  const outPath = join(OUT, 'spr_score_100.png');
  const { data, info } = await sharp(srcPath)
    .extract({ left: 200, top: 70, width: 624, height: 400 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, 30, { orphanMin: 6 });

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize(168, 64, { fit: 'inside', kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return 'spr_score_100';
}

/** Tileable sidewalk brick strip from level-complete left scene. */
async function extractBrickGround(srcPath) {
  const outPath = join(OUT, 'spr_brick_ground.png');
  await extractParallaxStrip(
    srcPath,
    { left: 0, top: 458, width: SCENE_W, height: 14 },
    outPath,
    320,
    6,
    { skyColor: SKY_COLOR_RGB, skyFillRatio: 0 },
  );
  return 'spr_brick_ground';
}

/** Keep saturated banner letter pixels; drop dark scene bleed. */
function isolateBannerText(data, width, height, channels) {
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const sat = saturation(r, g, b);
    const lum = luminance(r, g, b);
    if (sat > 38 && lum > 55) continue;
    if (sat > 22 && lum > 120 && (r > 140 || g > 140 || b > 140)) continue;
    data[i + 3] = 0;
  }
}

/** Compact level-complete banner text (React overlay handles in-game display). */
async function extractLevelCompleteBanner(srcPath) {
  const outPath = join(OUT, 'spr_level_complete.png');
  const { data, info } = await sharp(srcPath)
    .extract({ left: 380, top: 68, width: 540, height: 100 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bg = detectBackground(data, info.width, info.height, info.channels);
  processTransparency(data, info.width, info.height, info.channels, bg, 48, { orphanMin: 12 });
  isolateBannerText(data, info.width, info.height, info.channels);
  cleanEdgeHalos(data, info.width, info.height, info.channels, bg, 20);

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 8 })
    .resize(280, 52, { fit: 'inside', kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return 'spr_level_complete';
}

async function verifySprite(name) {
  const path = join(OUT, `${name}.png`);
  try {
    await sharp(path).metadata();
  } catch {
    console.warn(`  ⚠ ${name}: missing`);
    return;
  }
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let transparent = 0;
  let edgeHalo = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 20) {
        transparent++;
        continue;
      }
      if (a < 100) continue;

      const sat = saturation(r, g, b);
      const lum = luminance(r, g, b);
      const isNeutral = sat < 35 && lum > 70 && lum < 230;
      const isTeal = b > r + 8 && g > r && lum > 70 && lum < 240;
      if (!isNeutral && !isTeal) continue;

      let nearTransparent = false;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) {
          nearTransparent = true;
          break;
        }
        if (data[(ny * info.width + nx) * 4 + 3] < 20) {
          nearTransparent = true;
          break;
        }
      }
      if (nearTransparent) edgeHalo++;
    }
  }

  const tPct = ((transparent / total) * 100).toFixed(1);
  const hPct = ((edgeHalo / total) * 100).toFixed(2);
  const skipHaloCheck = /^(bg_|spr_brick_ground|spr_fence_tile)/.test(name);
  if (name.startsWith('spr_') && !skipHaloCheck && parseFloat(hPct) > 1.0) {
    console.warn(`  ⚠ ${name}: ${info.width}x${info.height}, edgeHalo=${hPct}%`);
  } else {
    console.log(`  ✓ ${name}: ${info.width}x${info.height}, transparent=${tPct}%`);
  }
}

async function main() {
  let lockFd;
  try {
    await mkdir(join(ROOT, 'tmp'), { recursive: true });
    lockFd = await open(LOCK, 'wx');
  } catch {
    console.error('Another extract-assets run is in progress. Exiting.');
    process.exit(1);
  }

  try {
    await runExtraction();
  } finally {
    await lockFd.close();
    await unlink(LOCK).catch(() => {});
  }
}

async function runExtraction() {
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
    for (const region of CYCLIST_REGIONS) {
      const outPath = join(OUT, `${region.name}.png`);
      const { left, top, width, height, name } = region;
      const { data, info } = await sharp(join(RAW, cyclistFile))
        .extract({ left, top, width, height })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const bg = detectBackground(data, info.width, info.height, info.channels);
      processTransparency(data, info.width, info.height, info.channels, bg, 50, { orphanMin: 12 });
      keepLargestComponent(data, info.width, info.height, info.channels);
      trimBelowMainBounds(data, info.width, info.height, info.channels);
      removeBottomStrayBlobs(data, info.width, info.height, info.channels);

      await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .trim({ threshold: 10 })
        .png({ compressionLevel: 9 })
        .toFile(outPath);

      manifest.player.push(name);
    }
    await normalizeFrameGroup(CYCLIST_REGIONS.map((f) => f.name), 'cyclist frames');
    for (const region of CYCLIST_REGIONS) {
      await refineEdgesOnDisk(join(OUT, `${region.name}.png`), 20);
    }
    console.log(`Cyclist: 6 frames from ${cyclistFile}`);
  }

  const pigeonFile = findFile(files, /rl2cnerl2cnerl2c__1_/);
  if (pigeonFile) {
    for (const region of PIGEON_REGIONS) {
      const outPath = join(OUT, `${region.name}.png`);
      await extractRegion(join(RAW, pigeonFile), region, outPath, 38, {
        orphanMin: 8,
      });
      manifest.pigeons.push(region.name);
    }
    await normalizeFrameGroup(PIGEON_REGIONS.map((r) => r.name), 'pigeon frames');
    console.log(`Pigeons: 5 frames from ${pigeonFile}`);
  }

  const smokeFile = findFile(files, /miqebhmiqebhmiqe__2_/);
  if (smokeFile) {
    for (const region of SMOKE_REGIONS) {
      const outPath = join(OUT, `${region.name}.png`);
      await extractRegion(join(RAW, smokeFile), region, outPath, 28, {
        orphanMin: region.orphanMin,
        trimThreshold: 4,
        smoke: true,
      });
      manifest.smoke.push(region.name);
    }
    await normalizeSmokeFrames(SMOKE_REGIONS.map((r) => r.name));
    console.log(`Smoke: 6 frames from ${smokeFile}`);
  }

  const pastryStackFile = findFile(files, /rl2cnerl2cnerl2c__3_/);
  if (pastryStackFile) {
    manifest.singles.push(await extractPastryStack(join(RAW, pastryStackFile)));
    console.log('Single: spr_pastry_stack (cropped bagels)');
  }

  const pastrySingleFile = findFile(files, /rl2cnerl2cnerl2c__5_/);
  if (pastrySingleFile) {
    manifest.singles.push(await extractPastrySingle(join(RAW, pastrySingleFile)));
    console.log('Single: spr_pastry_single');
  }

  const scoreFile = findFile(files, /rl2cnerl2cnerl2c__4_/);
  if (scoreFile) {
    manifest.singles.push(await extractScore100(join(RAW, scoreFile)));
    console.log('Single: spr_score_100 (+100 popup)');
  }

  const arrowFile = findFile(files, /miqebhmiqebhmiqe__1_/);
  if (arrowFile) {
    manifest.singles.push(await extractTelegraphArrow(join(RAW, arrowFile)));
    console.log('Single: spr_telegraph_arrow (tight crop)');
  }

  const levelFile = findFile(files, /rl2cnerl2cnerl2c__6_/);
  if (levelFile) {
    const levelPath = join(RAW, levelFile);
    manifest.parallax = await extractParallaxStrips(levelPath);
    manifest.singles.push(await extractLevelCompleteBanner(levelPath));
    manifest.singles.push(await extractBrickGround(levelPath));
    console.log(`Parallax: ${manifest.parallax.join(', ')}`);
    console.log('Level banner: spr_level_complete');
    console.log('Ground tile: spr_brick_ground');
  }

  const fenceFile = findFile(files, /miqebhmiqebhmiqe__3_/);
  if (fenceFile) {
    manifest.parallax.push(await extractFenceTile(join(RAW, fenceFile)));
    console.log('Fence tile: spr_fence_tile (fence sheet)');
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
