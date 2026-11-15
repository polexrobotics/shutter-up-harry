// Builds placeholder data so the site works before Instagram is connected:
//   npm run sample
// Writes painted placeholder images to public/media and fake posts to src/data.
// Running `npm run sync` with a real token replaces all of it.
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { DATA, MEDIA, writeJSON, saveImage } from './lib.mjs';

const PLACES = {
  'twelve-apostles': { name: 'Twelve Apostles, Victoria', lat: -38.6655, lng: 143.1044, tags: ['Coast'], title: 'The Apostles at First Light',
    story: 'Three dawns on the Great Ocean Road waiting for the swell to drop and the sea fog to lift off the stacks.' },
  'cape-schanck': { name: 'Cape Schanck, Victoria', lat: -38.4925, lng: 144.8853, tags: ['Coast'] },
  'brighton-beach': { name: 'Brighton Beach, Melbourne', lat: -37.9176, lng: 144.9866, tags: ['Coast', 'Melbourne'], title: 'Bathing Boxes' },
  'hosier-lane': { name: 'Hosier Lane, Melbourne', lat: -37.8166, lng: 144.9692, tags: ['City', 'Melbourne', 'Night'], title: 'Laneways After Dark',
    story: 'Melbourne after the trams stop: wet bluestone, paint still drying on the walls, and the city glowing over the Yarra.' },
  'dandenong-ranges': { name: 'Dandenong Ranges, Victoria', lat: -37.8503, lng: 145.3514, tags: ['Forest'], title: 'Mountain Ash Mornings' },
  'phillip-island': { name: 'Phillip Island, Victoria', lat: -38.4876, lng: 145.2390, tags: ['Coast'] },
  'wilsons-prom': { name: 'Wilsons Promontory, Victoria', lat: -39.0300, lng: 146.3200, tags: ['Coast'], title: 'The Prom',
    story: 'Squeaky Beach, Tidal River and the granite boulders of Picnic Bay, walked over a long weekend in winter.' },
  'grampians': { name: 'The Pinnacle, Grampians', lat: -37.1650, lng: 142.5220, tags: ['Mountains'], title: 'Gariwerd from the Pinnacle' },
  'cradle-mountain': { name: 'Cradle Mountain, Tasmania', lat: -41.6837, lng: 145.9512, tags: ['Mountains'], title: 'Cradle in the Snow' },
  'uluru': { name: 'Uluru, Northern Territory', lat: -25.3444, lng: 131.0369, tags: ['Desert'], title: 'Red Centre' },
  'kyoto': { name: 'Higashiyama, Kyoto', lat: 35.0036, lng: 135.7785, tags: ['City', 'Travel'], title: 'Kyoto in Autumn' },
  'reine': { name: 'Reine, Norway', lat: 67.9324, lng: 13.0888, tags: ['Coast', 'Night', 'Travel'], title: 'Lofoten in February' },
};

// [place, scene, time, caption, date]
const POSTS = [
  ['twelve-apostles', 'coast', 'dawn', 'Sea fog lifting off the stacks', '2025-06-14'],
  ['twelve-apostles', 'coast', 'golden', 'Gibson Steps at low tide', '2025-06-15'],
  ['twelve-apostles', 'coast', 'dusk', 'Loch Ard Gorge, last light', '2025-06-15'],
  ['twelve-apostles', 'coast', 'blue', 'Apostles under a quarter moon', '2025-06-16'],
  ['cape-schanck', 'coast', 'golden', 'Pulpit Rock', '2025-03-02'],
  ['cape-schanck', 'coast', 'dawn', 'The boardwalk before sunrise', '2025-03-02'],
  ['brighton-beach', 'coast', 'dawn', 'Bathing boxes, still morning', '2025-01-11'],
  ['brighton-beach', 'city', 'dusk', 'City skyline from Brighton', '2025-01-11'],
  ['hosier-lane', 'city', 'night', 'Hosier Lane in the rain', '2025-08-22'],
  ['hosier-lane', 'city', 'blue', 'Flinders Street at blue hour', '2025-08-22'],
  ['hosier-lane', 'city', 'night', 'Southbank reflections', '2025-08-23'],
  ['hosier-lane', 'city', 'dusk', 'Princes Bridge at dusk', '2025-08-23'],
  ['dandenong-ranges', 'forest', 'dawn', 'Fog in the mountain ash', '2025-05-04'],
  ['dandenong-ranges', 'forest', 'day', 'Tree ferns, Sherbrooke Forest', '2025-05-04'],
  ['dandenong-ranges', 'forest', 'golden', 'Light through the canopy', '2025-05-05'],
  ['phillip-island', 'coast', 'dusk', 'Pyramid Rock', '2024-12-28'],
  ['phillip-island', 'coast', 'blue', 'Cape Woolamai', '2024-12-28'],
  ['wilsons-prom', 'coast', 'golden', 'Squeaky Beach boulders', '2025-07-12'],
  ['wilsons-prom', 'coast', 'dawn', 'Tidal River mouth', '2025-07-13'],
  ['wilsons-prom', 'mountain', 'day', 'From Mount Oberon', '2025-07-13'],
  ['wilsons-prom', 'coast', 'dusk', 'Picnic Bay', '2025-07-14'],
  ['grampians', 'mountain', 'dawn', 'Sunrise from the Pinnacle', '2025-04-19'],
  ['grampians', 'mountain', 'golden', 'Boroka Lookout', '2025-04-19'],
  ['grampians', 'mountain', 'night', 'Stars over Halls Gap', '2025-04-20'],
  ['cradle-mountain', 'mountain', 'day', 'Dove Lake after snow', '2024-08-03'],
  ['cradle-mountain', 'mountain', 'dawn', 'The boatshed at dawn', '2024-08-04'],
  ['cradle-mountain', 'forest', 'day', 'Enchanted Walk', '2024-08-04'],
  ['uluru', 'desert', 'golden', 'Uluru at sunset', '2024-09-21'],
  ['uluru', 'desert', 'night', 'Milky Way over the Rock', '2024-09-21'],
  ['uluru', 'desert', 'dawn', 'Kata Tjuta at dawn', '2024-09-22'],
  ['kyoto', 'forest', 'golden', 'Maples at Eikandō', '2023-11-20'],
  ['kyoto', 'city', 'night', 'Gion lanterns', '2023-11-21'],
  ['kyoto', 'city', 'dawn', 'Yasaka Pagoda', '2023-11-22'],
  ['reine', 'aurora', 'night', 'Aurora over Reinebringen', '2024-02-10'],
  ['reine', 'coast', 'blue', 'Fishing cabins at blue hour', '2024-02-11'],
  ['reine', 'mountain', 'dawn', 'First light, Olstinden', '2024-02-12'],
];

const SKY = { dawn: ['#26355f', '#a46d7a', '#f4b26b'], day: ['#4d8cc8', '#8dbde0', '#e3eef3'], golden: ['#e59b4b', '#f2c480', '#fbe6c0'],
  dusk: ['#1e2550', '#8a3f62', '#f17b51'], blue: ['#0c1838', '#2a4580', '#6f8fc4'], night: ['#03050c', '#0b1530', '#1b2c52'] };
const LAND = { dawn: [42, 38, 58], day: [58, 74, 70], golden: [88, 62, 44], dusk: [40, 30, 48], blue: [18, 26, 48], night: [8, 12, 22] };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rgb = (c, k) => `rgb(${c.map((v) => Math.round(Math.min(255, v * k))).join(',')})`;

function ridge(r, w, base, amp) {
  let pts = Array.from({ length: 10 }, (_, i) => [(i * w) / 9, base - r() * amp]);
  for (let it = 0; it < 5; it++) {
    const nx = [];
    for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; nx.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (r() - 0.5) * amp / (it + 1)]); }
    nx.push(pts.at(-1)); pts = nx;
  }
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
}

function svg(scene, time, seed, w, h) {
  const r = rng(seed), sky = SKY[time], lt = LAND[time], hz = h * (0.55 + r() * 0.1);
  const night = time === 'night' || time === 'blue';
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".6" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
    <radialGradient id="sun"><stop offset="0" stop-color="#fff8e1" stop-opacity=".95"/><stop offset=".15" stop-color="#ffecbe" stop-opacity=".6"/><stop offset="1" stop-color="#ffdcaa" stop-opacity="0"/></radialGradient>
    <radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46ffa0" stop-opacity="0"/><stop offset="1" stop-color="#78ffbe" stop-opacity=".35"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#s)"/>`;
  if (night) for (let i = 0; i < (time === 'night' ? 260 : 70); i++) out += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * hz * 0.9).toFixed(0)}" r="${(r() * 1.4 + 0.3).toFixed(1)}" fill="#fff" opacity="${r().toFixed(2)}"/>`;
  if (scene === 'aurora') for (let b = 0; b < 3; b++) { const y = hz * (0.3 + r() * 0.25); out += `<path d="M0 ${y} C ${w * 0.3} ${y - h * 0.12}, ${w * 0.6} ${y + h * 0.1}, ${w} ${y - h * 0.05} L ${w} ${y - h * 0.3} C ${w * 0.6} ${y - h * 0.2}, ${w * 0.3} ${y - h * 0.4}, 0 ${y - h * 0.25} Z" fill="url(#a)"/>`; }
  if (!night) { const sx = w * (0.2 + r() * 0.6), sy = hz * (time === 'day' ? 0.3 : 0.85); out += `<circle cx="${sx}" cy="${sy}" r="${w * 0.25}" fill="url(#sun)"/>`; }
  else if (r() > 0.4) out += `<circle cx="${w * (0.15 + r() * 0.7)}" cy="${hz * 0.25}" r="${w * 0.018}" fill="#f5f5eb" opacity=".9"/>`;
  for (let L = 0; L < 4; L++) {
    const base = hz + (L - 1) * h * 0.05, k = 1.6 - L * 0.32;
    let fill = rgb(lt, k), pts;
    if (scene === 'desert') { fill = rgb([lt[0] + 90, lt[1] + 40, lt[2] + 10], 1.3 - L * 0.12); pts = Array.from({ length: 60 }, (_, i) => { const x = (i * w) / 59; return `${x.toFixed(0)},${(base + h * 0.05 + Math.sin((x / w) * (3 + L) + L * 3 + seed % 7) * h * 0.05).toFixed(0)}`; }).join(' '); }
    else if (scene === 'mountain' || scene === 'aurora' || (scene === 'coast' && L < 2) || (scene === 'forest' && L < 1)) pts = ridge(r, w, base, h * (L === 0 ? 0.3 : 0.2 - L * 0.04));
    else pts = ridge(r, w, base + h * 0.06, h * 0.05);
    out += `<polygon points="0,${h} ${pts} ${w},${h}" fill="${fill}" opacity="${L === 0 ? 0.55 : 1}"/>`;
    if (scene === 'forest' && L >= 1) for (let i = 0; i < 60; i++) { const x = r() * w, y = base + h * 0.05 + r() * h * 0.05, th = h * (0.08 + r() * 0.1) * (1 + L * 0.3); out += `<polygon points="${x},${y - th} ${x - th * 0.28},${y + 4} ${x + th * 0.28},${y + 4}" fill="${rgb(lt, 0.9 - L * 0.15)}"/>`; }
  }
  if (scene === 'coast' || scene === 'aurora') {
    const wy = hz + h * 0.07;
    out += `<rect x="0" y="${wy}" width="${w}" height="${h - wy}" fill="${sky[1]}" opacity=".9"/>`;
    for (let i = 0; i < 90; i++) out += `<rect x="${(r() * w).toFixed(0)}" y="${(wy + Math.pow(r(), 1.6) * (h - wy)).toFixed(0)}" width="${(w * (0.01 + r() * 0.05)).toFixed(0)}" height="1.5" fill="#fff" opacity=".2"/>`;
    if (scene === 'coast' && r() > 0.5) for (let i = 0; i < 4; i++) { const bx = w * (0.1 + r() * 0.8), bw = w * 0.03; out += `<rect x="${bx}" y="${wy - bw}" width="${bw}" height="${bw}" fill="${['#c0392b', '#2471a3', '#f1c40f', '#27ae60'][i]}"/>`; }
  }
  if (scene === 'city') {
    const gy = hz + h * 0.08; let x = -10; const lit = night || time === 'dusk';
    while (x < w) {
      const bw = w * (0.04 + r() * 0.07), bh = h * (0.08 + r() * 0.32);
      out += `<rect x="${x.toFixed(0)}" y="${(gy - bh).toFixed(0)}" width="${bw.toFixed(0)}" height="${(bh + h).toFixed(0)}" fill="${rgb(lt, 1.2 + r() * 0.5)}"/>`;
      for (let yy = gy - bh + 8; yy < gy - 4; yy += h * 0.03) for (let xx = x + 5; xx < x + bw - 6; xx += w * 0.014)
        if (r() > (lit ? 0.55 : 0.88)) out += `<rect x="${xx.toFixed(0)}" y="${yy.toFixed(0)}" width="${(w * 0.006).toFixed(0)}" height="${(h * 0.012).toFixed(0)}" fill="${lit ? '#ffcf70' : '#1e2832'}" opacity=".8"/>`;
      x += bw + r() * w * 0.01;
    }
    out += `<rect x="0" y="${gy}" width="${w}" height="${h - gy}" fill="${rgb(lt, 0.7)}"/>`;
  }
  return out + `<rect width="${w}" height="${h}" fill="url(#v)"/></svg>`;
}

const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

await fs.rm(MEDIA, { recursive: true, force: true });
const posts = [];
for (const [i, [place, scene, time, caption, date]] of POSTS.entries()) {
  const id = `sample${String(i + 1).padStart(3, '0')}`;
  const portrait = i % 5 === 3;
  const [w, h] = portrait ? [1080, 1350] : [1440, 960];
  const buf = await sharp(Buffer.from(svg(scene, time, hash(id), w, h))).jpeg({ quality: 88 }).toBuffer();
  const img = await saveImage(buf, `${id}-0`);
  posts.push({ id, caption: `${caption}\n\n📍 ${PLACES[place].name}\n\n#placeholder`, permalink: 'https://www.instagram.com/', timestamp: `${date}T07:30:00+0000`,
    type: 'IMAGE', place, images: [img] });
}
await writeJSON(path.join(DATA, 'posts.json'), posts);
await writeJSON(path.join(DATA, 'places.json'), { places: PLACES, posts: {} });
console.log(`Sample data: ${posts.length} posts in ${Object.keys(PLACES).length} places.`);
