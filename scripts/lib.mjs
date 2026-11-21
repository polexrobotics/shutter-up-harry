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

/** Save one image as a web copy (longest side `max` px) and a small thumbnail. */
export async function saveImage(buffer, base, { max = 1600, thumb = 480, quality = 84 } = {}) {
  await fs.mkdir(MEDIA, { recursive: true });
  const img = sharp(buffer).rotate();
  const meta = await img.metadata();
  await img.clone().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true }).toFile(path.join(MEDIA, `${base}.jpg`));
  await img.clone().resize({ width: thumb, height: thumb, fit: 'inside' })
    .jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(MEDIA, `${base}-sm.jpg`));
  // EXIF orientations 5-8 are rotated a quarter turn, so width and height swap.
  const [ow, oh] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const scale = Math.min(1, max / Math.max(ow, oh));
  const w = Math.round(ow * scale), h = Math.round(oh * scale);
  return { file: `${base}.jpg`, thumb: `${base}-sm.jpg`, w, h };
}

export const exists = (p) => fs.access(p).then(() => true, () => false);

/**
 * Give every photo a permanent number (image.no), shown on the site as #123.
 * Photos keep the number they already had; new photos get the next numbers, oldest first.
 * Numbers are never reused, even if a photo is later removed.
 */
export function numberPhotos(posts, previousPosts = []) {
  const old = new Map();
  let max = 0;
  for (const p of previousPosts) for (const [i, img] of (p.images || []).entries()) {
    if (Number.isInteger(img.no)) { old.set(`${p.id}-${i}`, img.no); max = Math.max(max, img.no); }
  }
  const taken = new Set();
  const ordered = [...posts].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  for (const p of ordered) for (const [i, img] of p.images.entries()) {
    const no = img.no ?? old.get(`${p.id}-${i}`);
    if (Number.isInteger(no) && !taken.has(no)) { img.no = no; taken.add(no); max = Math.max(max, no); } else delete img.no;
  }
  for (const p of ordered) for (const img of p.images) if (img.no == null) img.no = ++max;
  return posts;
}

/** Web copy and thumbnail sizes used for every photo on the site. */
export const SIZES = { max: 1280, thumb: 400, quality: 80 };

/** Map filter chips, by continent. */
export const REGION = { OC: 'Australia & NZ', NA: 'North America', SA: 'South America', EU: 'Europe', AS: 'Asia', AF: 'Africa', AN: 'Antarctica' };

/** Distance in km between two { lat, lng } points. */
export function km(a, b) {
  const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The biggest city near a point (scripts/data/cities.json), as { name, cc, d } where d is its distance in km. */
export function nearestCity(cities, c) {
  let pick = null, score = -1;
  for (const [name, lat, lng, pop, cc] of cities.cities) {
    if (Math.abs(lat - c.lat) > 1 || Math.abs(lng - c.lng) > 1.5) continue;
    const d = km(c, { lat, lng });
    const s = d <= 40 ? pop / (1 + (d / 20) ** 2) : -1;
    if (s > score) { score = s; pick = { name, cc, d }; }
  }
  if (!pick) { // nothing big nearby: nearest town of 15k+
    let bd = Infinity;
    for (const [name, lat, lng, , cc] of cities.cities) { const d = km(c, { lat, lng }); if (d < bd) { bd = d; pick = { name, cc, d }; } }
  }
  return pick;
}
