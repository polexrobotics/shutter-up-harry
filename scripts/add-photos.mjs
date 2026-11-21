// Add the photos Harry sent from the upload page (/upload/) to the site.
//
//   npm run add-photos
//
// The upload page commits each submission to inbox/<id>/ as post.json plus the photos (0.jpg, 1.jpg, …).
// The "Add photos" GitHub Action runs this script, which for each submission:
//   1. makes the web copy and thumbnail in public/media, the same sizes as imported photos
//   2. pins it to a place: the one Harry picked, else the nearest place on the map (within 35 km),
//      else a new place named after the nearest city
//   3. gives each photo the next permanent number (#123)
//   4. adds the post to src/data/posts.json (marked "source": "upload" so later imports keep it)
//      and removes the submission from inbox/
// A submission that can't be added is moved to inbox/failed/<id>/ with a reason.txt, so it never blocks the others.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA, ROOT, readJSON, writeJSON, slugify, saveImage, numberPhotos, km, nearestCity, REGION, SIZES } from './lib.mjs';

const INBOX = path.join(ROOT, 'inbox');
const NEAR_KM = 35; // same distance the importer uses to group photos into one place
const MAX_IMAGES = 10, MAX_BYTES = 30 * 1024 * 1024, MAX_CAPTION = 2200;
const ID = /^up-[a-z0-9-]{6,48}$/;
const IMAGE = /^\d{1,2}\.(jpe?g|png|webp)$/i;

const isLat = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 90;
const isLng = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180;
const round = (v, n) => +v.toFixed(n);

async function submissions() {
  const dirs = await fs.readdir(INBOX, { withFileTypes: true }).catch(() => []);
  return dirs.filter((d) => d.isDirectory() && d.name !== 'failed').map((d) => d.name).sort();
}

/** Work out which place a submission belongs to, adding a new place if needed. Returns the place key. */
function placeFor(sub, geo, placeData, cities) {
  const places = placeData.places;
  const want = sub.place || {};
  if (typeof want.key === 'string' && places[want.key]) return want.key;
  if (!geo) throw new Error('No location: pick a place on the map or from the list.');

  const name = typeof want.name === 'string' ? want.name.trim().slice(0, 80) : '';
  const city = nearestCity(cities, geo);
  const country = cities.countries[city.cc] || city.cc;
  const tags = [REGION[cities.continents[city.cc]] || 'Elsewhere'];

  if (name) { // Harry named a new place
    let key = slugify(name) || 'place';
    if (places[key] && km(places[key], geo) <= NEAR_KM) return key; // same name, same spot: join it
    while (places[key]) key += '-2';
    places[key] = { name, lat: round(geo.lat, 4), lng: round(geo.lng, 4), tags };
    return key;
  }

  // Automatic: the nearest place already on the map, if it's close enough.
  let best = null, bd = Infinity;
  for (const [key, p] of Object.entries(places)) {
    if (p.hidden || p.lat == null) continue;
    const d = km(p, geo);
    if (d < bd) { bd = d; best = key; }
  }
  if (best && bd <= NEAR_KM) return best;

  // Otherwise a new place named after the nearest city, like the importer does.
  let key = slugify(city.name);
  if (places[key]) key = slugify(`${city.name}-${city.cc}`);
  while (places[key]) key += '-2';
  places[key] = {
    name: city.d > 15 ? `Near ${city.name}, ${country}` : `${city.name}, ${country}`,
    lat: round(geo.lat, 4), lng: round(geo.lng, 4), tags,
    ...(city.d > 15 && { title: `Around ${city.name}` }),
  };
  return key;
}

async function addOne(id, ctx) {
  if (!ID.test(id)) throw new Error(`Folder name "${id}" isn't a valid submission id.`);
  const dir = path.join(INBOX, id);
  const sub = JSON.parse(await fs.readFile(path.join(dir, 'post.json'), 'utf8'));
  if (ctx.posts.some((p) => p.id === id)) throw new Error('This submission was already added.');

  const files = Array.isArray(sub.images) ? sub.images : [];
  if (!files.length) throw new Error('No photos in the submission.');
  if (files.length > MAX_IMAGES) throw new Error(`Too many photos (at most ${MAX_IMAGES} per post).`);
  if (!files.every((f) => typeof f === 'string' && IMAGE.test(f))) throw new Error('Unexpected photo file name.');

  const caption = typeof sub.caption === 'string' ? sub.caption.slice(0, MAX_CAPTION).trim() : '';
  const when = new Date(sub.date || Date.now());
  const timestamp = (Number.isNaN(+when) || when > new Date(Date.now() + 864e5) ? new Date() : when).toISOString();
  const g = sub.place || {};
  const geo = isLat(g.lat) && isLng(g.lng) ? { lat: round(g.lat, 5), lng: round(g.lng, 5) } : null;
  const place = placeFor(sub, geo, ctx.placeData, ctx.cities);
  const at = geo || { lat: ctx.placeData.places[place].lat, lng: ctx.placeData.places[place].lng };

  const images = [];
  for (const [i, f] of files.entries()) {
    const buf = await fs.readFile(path.join(dir, f));
    if (buf.length > MAX_BYTES) throw new Error(`${f} is too big.`);
    const saved = await saveImage(buf, `${id}-${i}`, SIZES);
    ctx.made.push(saved.file, saved.thumb);
    images.push({ ...saved, lat: at.lat, lng: at.lng });
  }
  return { id, caption, permalink: null, timestamp, type: images.length > 1 ? 'CAROUSEL_ALBUM' : 'IMAGE', geo: at, images, place, source: 'upload' };
}

async function main() {
  const ids = await submissions();
  if (!ids.length) { console.log('Nothing in inbox/.'); return; }
  const cities = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/data/cities.json'), 'utf8'));
  const postsFile = path.join(DATA, 'posts.json'), placesFile = path.join(DATA, 'places.json');
  const previousList = await readJSON(postsFile, []);
  const placeData = await readJSON(placesFile, { places: {}, posts: {} });
  placeData.places ??= {};
  const ctx = { posts: previousList, placeData, cities, made: [] };

  const added = [], failed = [];
  for (const id of ids) {
    const placesBefore = JSON.stringify(placeData.places);
    ctx.made = [];
    try {
      added.push(await addOne(id, ctx));
      await fs.rm(path.join(INBOX, id), { recursive: true, force: true });
    } catch (e) {
      placeData.places = JSON.parse(placesBefore); // undo a place this submission may have added
      ctx.placeData = placeData;
      for (const f of ctx.made) await fs.rm(path.join(ROOT, 'public/media', f), { force: true });
      failed.push({ id, reason: e.message });
      const to = path.join(INBOX, 'failed', ID.test(id) ? id : `bad-${Date.now()}`);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(path.join(INBOX, id), to).catch(() => {});
      await fs.writeFile(path.join(to, 'reason.txt'), e.message + '\n').catch(() => {});
    }
  }

  if (added.length) {
    const posts = [...added, ...previousList];
    numberPhotos(posts, previousList); // new photos get the next numbers
    posts.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    await writeJSON(postsFile, posts);
    await writeJSON(placesFile, placeData);
  }

  const lines = ['## Photos added', ''];
  for (const p of added) {
    const pl = placeData.places[p.place];
    lines.push(`- ${p.images.map((i) => `#${i.no}`).join(', ')} at ${pl.title || pl.name} (\`${p.place}\`)${p.caption ? `: ${p.caption.split('\n')[0].slice(0, 80)}` : ''}`);
  }
  if (failed.length) { lines.push('', '## Not added', ''); for (const f of failed) lines.push(`- \`${f.id}\`: ${f.reason} (kept in inbox/failed/)`); }
  const text = lines.join('\n') + '\n';
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, text);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
