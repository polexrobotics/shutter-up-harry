// Import an Instagram "Download your information" export (JSON format) onto the map.
//
//   npm run import -- "C:\path\to\instagram-shutter.up.harry-2026-11-15-xxxx"
//
// No API or token needed. The export holds every post's photos, caption, date and,
// for most posts, the GPS position the photo was taken at. This script:
//   1. reads your_instagram_activity/media/posts_*.json
//   2. makes web-sized copies of each photo in public/media (HEIC included); re-runs skip done photos
//   3. groups posts into places by distance (about 35 km), named after the biggest nearby city
//   4. keeps photos added with the upload page (/upload/) and gives each new photo the next permanent number (#123); existing photos keep theirs
//   5. writes src/data/posts.json and merges src/data/places.json, keeping any edits Harry made
// Reels (videos) are skipped for now.
import fs from 'node:fs/promises';
import path from 'node:path';
import heicConvert from 'heic-convert';
import { DATA, MEDIA, ROOT, readJSON, writeJSON, slugify, cleanCaption, saveImage, exists, numberPhotos, km, nearestCity, REGION, SIZES } from './lib.mjs';

const dir = process.argv[2];
if (!dir) { console.error('Usage: npm run import -- <path to the unzipped Instagram export>'); process.exit(1); }

const CLUSTER_KM = 35;
const IMAGE = /\.(jpe?g|png|webp|heic|heif)$/i;

function geoOf(m) {
  const md = m.media_metadata || {};
  for (const k of ['photo_metadata', 'video_metadata']) {
    for (const e of md[k]?.exif_data || []) if (typeof e.latitude === 'number' && (e.latitude || e.longitude)) return { lat: e.latitude, lng: e.longitude };
  }
  return null;
}
// Instagram exports encode text as Latin-1 bytes of UTF-8 (so "é" shows as "Ã©"). Undo that.
function fixText(s = '') {
  try { const b = Buffer.from(s, 'latin1'); const u = b.toString('utf8'); return u.includes('\uFFFD') ? s : u; } catch { return s; }
}

async function readPosts() {
  const mdir = path.join(dir, 'your_instagram_activity', 'media');
  const files = (await fs.readdir(mdir)).filter((f) => /^posts_\d+\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`No posts_*.json found in ${mdir}. Was the export made in JSON format?`);
  const all = [];
  for (const f of files) all.push(...JSON.parse(await fs.readFile(path.join(mdir, f), 'utf8')));
  return all;
}

async function toImage(file) {
  const buf = await fs.readFile(file);
  // Some ".heic" files in exports are really JPEGs, so check the bytes, not the name.
  const isHeif = buf.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|mif1|msf1|heis)/.test(buf.subarray(8, 12).toString('latin1'));
  if (isHeif) return Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.92 }));
  return buf;
}

async function main() {
  const cities = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/data/cities.json'), 'utf8'));
  const raw = await readPosts();
  const previousList = await readJSON(path.join(DATA, 'posts.json'), []);
  const previous = Object.fromEntries(previousList.map((p) => [p.id, p]));
  const placeData = await readJSON(path.join(DATA, 'places.json'), { places: {}, posts: {} });
  // Drop sample places (no real posts) but keep anything Harry edited.
  const isSample = (k) => Object.values(previous).some((p) => p.place === k && String(p.id).startsWith('sample'));
  for (const k of Object.keys(placeData.places)) if (isSample(k)) delete placeData.places[k];
  for (const k of Object.keys(previous)) if (k.startsWith('sample')) delete previous[k];

  const posts = [];
  let missing = 0, videos = 0, done = 0;
  for (const entry of raw) {
    const media = entry.media || [];
    const imgs = media.filter((m) => IMAGE.test(m.uri));
    videos += media.length - imgs.length;
    if (!imgs.length) continue;
    const id = path.basename(imgs[0].uri).replace(/\.[^.]+$/, '');
    const caption = fixText(entry.title || imgs[0].title || '');
    const ts = entry.creation_timestamp || imgs[0].creation_timestamp;
    const geo = imgs.map(geoOf).find(Boolean) || null;
    const images = [];
    for (const [i, m] of imgs.entries()) {
      const base = `ig-${id}-${i}`;
      const known = previous[id]?.images?.[i];
      if (known && (await exists(path.join(MEDIA, known.file)))) { images.push(known); continue; }
      const src = path.join(dir, ...m.uri.split('/'));
      if (!(await exists(src))) { missing++; continue; }
      try {
        const saved = await saveImage(await toImage(src), base, SIZES);
        const g = geoOf(m);
        images.push(g ? { ...saved, lat: +g.lat.toFixed(5), lng: +g.lng.toFixed(5) } : saved);
        done++;
        if (done % 25 === 0) console.log(`  ${done} photos converted…`);
      } catch (e) { console.warn(`  skipped ${m.uri}: ${e.message}`); }
    }
    if (!images.length) continue;
    posts.push({ id, caption, permalink: null, timestamp: new Date(ts * 1000).toISOString(), type: imgs.length > 1 ? 'CAROUSEL_ALBUM' : 'IMAGE',
      geo: geo && { lat: +geo.lat.toFixed(5), lng: +geo.lng.toFixed(5) }, images });
  }

  // Group nearby posts into places (greedy, oldest first, running centre).
  const clusters = [];
  for (const p of [...posts].filter((p) => p.geo).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))) {
    let best = null, bd = Infinity;
    for (const c of clusters) { const d = km(c, p.geo); if (d < bd) { bd = d; best = c; } }
    if (best && bd <= CLUSTER_KM) {
      best.posts.push(p); const n = best.posts.length;
      best.lat += (p.geo.lat - best.lat) / n; best.lng += (p.geo.lng - best.lng) / n;
    } else clusters.push({ lat: p.geo.lat, lng: p.geo.lng, posts: [p] });
  }

  const nameFor = (c) => nearestCity(cities, c);
  // Clusters that end up named after the same town and sit close together become one place.
  for (let i = 0; i < clusters.length; i++) {
    const a = clusters[i]; a.pick ||= nameFor(a);
    for (let j = i + 1; j < clusters.length; j++) {
      const b = clusters[j]; b.pick ||= nameFor(b);
      if (b.pick.name !== a.pick.name || b.pick.cc !== a.pick.cc || km(a, b) > 120) continue;
      const n = a.posts.length + b.posts.length;
      a.lat = (a.lat * a.posts.length + b.lat * b.posts.length) / n;
      a.lng = (a.lng * a.posts.length + b.lng * b.posts.length) / n;
      a.posts.push(...b.posts); clusters.splice(j--, 1);
      a.pick = nameFor(a);
    }
  }
  const byKey = {};
  for (const c of clusters) {
    const pick = c.pick;
    const country = cities.countries[pick.cc] || pick.cc;
    let key = slugify(`${pick.name}`);
    if (byKey[key] && byKey[key] !== c) key = slugify(`${pick.name}-${pick.cc}`);
    while (byKey[key]) key += '-2';
    byKey[key] = c;
    const old = placeData.places[key] || {};
    placeData.places[key] = {
      name: pick.d > 15 ? `Near ${pick.name}, ${country}` : `${pick.name}, ${country}`,
      lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4),
      tags: [REGION[cities.continents[pick.cc]] || 'Elsewhere'],
      ...old, // Harry's edits win
    };
    if (!old.title && pick.d > 15) placeData.places[key].title = `Around ${pick.name}`;
    for (const p of c.posts) p.place = key;
  }
  // Photos Harry added with the upload page (/upload/) aren't in the export: keep them as they are.
  posts.push(...previousList.filter((p) => p.source === 'upload'));
  // Places that no longer have any posts are removed unless Harry edited them by hand.
  const used = new Set([...posts.map((p) => p.place), ...Object.values(placeData.posts || {}).map((s) => s.place)].filter(Boolean));
  for (const k of Object.keys(placeData.places)) if (!used.has(k) && !placeData.places[k].keep) delete placeData.places[k];

  numberPhotos(posts, previousList); // permanent photo numbers (#123)
  posts.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  await writeJSON(path.join(DATA, 'posts.json'), posts);
  await writeJSON(path.join(DATA, 'places.json'), placeData);

  const moved = placeData.posts || {};
  const noGeo = posts.filter((p) => !p.place && !moved[p.id]?.place);
  const lines = [`# Instagram export import`, '', `Run: ${new Date().toISOString()}`, '',
    `- ${posts.length} posts with photos`, `- ${posts.length - noGeo.length} on the map in ${clusters.length} places`,
    `- ${noGeo.length} without a location (set one in src/data/places.json under "posts")`, `- ${videos} videos/reels skipped`,
    missing ? `- ${missing} photo files missing from the export folder` : '', '', '## Places', ''];
  for (const [k, c] of Object.entries(byKey).sort((a, b) => b[1].posts.length - a[1].posts.length)) lines.push(`- ${placeData.places[k].title || placeData.places[k].name} (\`${k}\`): ${c.posts.length} posts`);
  if (noGeo.length) { lines.push('', '## Posts without a location', ''); for (const p of noGeo) lines.push(`- \`${p.id}\` ${p.timestamp.slice(0, 10)}: ${cleanCaption(p.caption).split('\n')[0].slice(0, 80)}`); }
  await fs.writeFile(path.join(ROOT, 'import-report.md'), lines.filter((l) => l !== null).join('\n') + '\n');
  console.log(`Imported ${posts.length} posts into ${clusters.length} places (${done} new photos, ${missing} missing). See import-report.md.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
