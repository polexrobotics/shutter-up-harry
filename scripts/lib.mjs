// Shared helpers for the sync and sample scripts.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA = path.join(ROOT, 'src/data');
export const MEDIA = path.join(ROOT, 'public/media');

export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

export const slugify = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Find the place a post was taken, from its caption.
 * Instagram's API does not return the location tag, so Harry adds a line such as
 *   📍 Twelve Apostles, Victoria
 * (or "Location: ..."). Anything after a # or a line break is ignored.
 */
export function placeFromCaption(caption = '') {
  const m = caption.match(/📍\s*([^\n#]+)/u) || caption.match(/^\s*(?:location|place)\s*[:\-–]\s*([^\n#]+)/imu);
  return m ? m[1].trim().replace(/[.\s]+$/, '') : null;
}

/** Caption text without the place line and hashtags, for use as a story. */
export function cleanCaption(caption = '') {
  return caption
    .replace(/📍[^\n]*/gu, '')
    .replace(/^\s*(?:location|place)\s*[:\-–][^\n]*/gimu, '')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '')
    .replace(/(^|\s)@[\w.]+/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Save one image as a web copy (max 1600 px) and a small thumbnail (480 px). */
export async function saveImage(buffer, base) {
  await fs.mkdir(MEDIA, { recursive: true });
  const img = sharp(buffer).rotate();
  const meta = await img.metadata();
  await img.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(MEDIA, `${base}.jpg`));
  await img.clone().resize({ width: 480, height: 480, fit: 'inside' })
    .jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(MEDIA, `${base}-sm.jpg`));
  const w = Math.min(meta.width, 1600), h = Math.round(meta.height * (w / meta.width));
  return { file: `${base}.jpg`, thumb: `${base}-sm.jpg`, w, h };
}

export const exists = (p) => fs.access(p).then(() => true, () => false);
