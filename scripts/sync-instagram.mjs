// Pull Harry's Instagram posts into the site.
//
//   IG_ACCESS_TOKEN=... npm run sync
//
// 1. Lists every post on the account (Instagram API with Instagram Login, professional account).
// 2. Downloads each image (carousels included) into public/media, with a thumbnail.
// 3. Reads the place from a "📍 Place name" line in the caption and looks up its coordinates
//    (OpenStreetMap Nominatim), remembering them in src/data/places.json.
// 4. Writes src/data/posts.json and a sync-report.md listing posts that still need a place.
//
// Harry's own edits in src/data/places.json (titles, stories, moved pins, hidden posts) are never overwritten.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA, MEDIA, ROOT, readJSON, writeJSON, slugify, placeFromCaption, saveImage, exists, numberPhotos } from './lib.mjs';

const TOKEN = process.env.IG_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('IG_ACCESS_TOKEN is not set. Add it to .env or your hosting secrets (see README).');
  process.exit(1);
}
const API = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';
const UA = 'photo-map-site-sync/1.0';

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Instagram API: ${body.error?.message || res.status}`);
  return body;
}

async function listMedia() {
  const all = [];
  let url = `${API}/me/media?fields=${encodeURIComponent(FIELDS)}&limit=50&access_token=${TOKEN}`;
  while (url) {
    const page = await getJSON(url);
    all.push(...(page.data || []));
    url = page.paging?.next || null;
  }
  return all;
}

// Nominatim's usage policy: at most one request per second, identify the client.
let lastGeo = 0;
async function geocode(query, cache) {
  if (cache[query] !== undefined) return cache[query];
  const wait = 1100 - (Date.now() - lastGeo);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeo = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  const hit = res.ok ? (await res.json())[0] : null;
  cache[query] = hit ? { lat: +(+hit.lat).toFixed(4), lng: +(+hit.lon).toFixed(4) } : null;
  return cache[query];
}

const imageFor = (m) => (m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url) || m.thumbnail_url;

async function main() {
  const placesFile = path.join(DATA, 'places.json');
  const postsFile = path.join(DATA, 'posts.json');
  const cacheFile = path.join(DATA, 'geocache.json');
  const places = await readJSON(placesFile, { places: {}, posts: {} });
  places.places ??= {}; places.posts ??= {};
  const cache = await readJSON(cacheFile, {});
  const previousList = await readJSON(postsFile, []);
  const previous = Object.fromEntries(previousList.map((p) => [p.id, p]));

  console.log('Listing posts…');
  const media = await listMedia();
  console.log(`Found ${media.length} posts.`);

  const posts = [];
  const unplaced = [];
  const newPlaces = [];
  for (const m of media) {
    const parts = m.children?.data?.length ? m.children.data : [m];
    // Download images we don't already have. Instagram's image links expire, so we keep our own copies.
    const images = [];
    for (const [i, part] of parts.entries()) {
      const base = `ig-${m.id}-${i}`;
      const known = previous[m.id]?.images?.[i];
      if (known && (await exists(path.join(MEDIA, known.file)))) { images.push(known); continue; }
      const src = imageFor(part);
      if (!src) continue;
      const res = await fetch(src);
      if (!res.ok) { console.warn(`  could not download image ${i + 1} of ${m.permalink}`); continue; }
      images.push(await saveImage(Buffer.from(await res.arrayBuffer()), base));
    }
    if (!images.length) continue;

    // Work out the place: Harry's manual choice wins, then the 📍 line in the caption.
    const manual = places.posts[m.id]?.place;
    let key = manual || null;
    const text = placeFromCaption(m.caption);
    if (!key && text) {
      key = slugify(text);
      if (!places.places[key]) {
        const geo = await geocode(text, cache);
        if (geo) {
          places.places[key] = { name: text, ...geo, check: true };
          newPlaces.push({ key, text, ...geo });
        } else {
          key = null;
        }
      }
    }
    if (!key) unplaced.push({ m, text });

    posts.push({
      id: m.id,
      caption: m.caption || '',
      permalink: m.permalink,
      timestamp: m.timestamp,
      type: m.media_type,
      place: key,
      images,
    });
  }

  numberPhotos(posts, previousList); // permanent photo numbers (#123)
  await writeJSON(postsFile, posts);
  await writeJSON(placesFile, places);
  await writeJSON(cacheFile, cache);

  const lines = [
    `# Instagram sync report`, '', `Run: ${new Date().toISOString()}`, '',
    `- ${posts.length} posts imported`, `- ${posts.length - unplaced.length} on the map`, `- ${unplaced.length} without a place`, '',
  ];
  if (newPlaces.length) {
    lines.push('## New places to check', '', 'These were looked up automatically. Fix any wrong pins in src/data/places.json, then delete `"check": true`.', '');
    for (const p of newPlaces) lines.push(`- **${p.text}** → ${p.lat}, ${p.lng} (key \`${p.key}\`)`);
    lines.push('');
  }
  if (unplaced.length) {
    lines.push('## Posts without a place', '', 'Add a "📍 Place name" line to the Instagram caption, or set it in src/data/places.json under "posts": { "<id>": { "place": "<place key>" } }.', '');
    for (const { m, text } of unplaced) {
      const first = (m.caption || '').split('\n')[0].slice(0, 80);
      lines.push(`- \`${m.id}\` ${m.permalink}: ${first || '(no caption)'}${text ? ` (couldn't find "${text}")` : ''}`);
    }
  }
  await fs.writeFile(path.join(ROOT, 'sync-report.md'), lines.join('\n') + '\n');
  console.log(`Done. ${unplaced.length} posts need a place; see sync-report.md.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
