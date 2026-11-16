// Turns imported posts + Harry's place settings into the series shown on the map.
import posts from '../data/posts.json';
import placeData from '../data/places.json';
import site from '../site.config.js';

const strip = (caption = '') =>
  caption.replace(/📍[^\n]*/gu, '').replace(/^\s*(?:location|place)\s*[:\-–][^\n]*/gimu, '')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '').replace(/\n{3,}/g, '\n\n').trim();
const firstLine = (s) => s.split('\n').map((l) => l.trim()).find(Boolean) || '';
const monthYear = (iso) => new Date(iso).toLocaleDateString('en-AU', { month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' });

export function getSeries() {
  const places = placeData.places || {};
  const postSettings = placeData.posts || {};
  const groups = new Map();
  for (const p of posts) {
    const s = postSettings[p.id] || {};
    if (s.hidden) continue;
    const key = s.place || p.place;
    const place = key && places[key];
    if (!place || place.hidden || place.lat == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const series = [];
  for (const [key, list] of groups) {
    const place = places[key];
    list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const photos = list.flatMap((p) => p.images.map((img, i) => ({
      id: `${p.id}-${i}`,
      src: `/media/${img.file}`,
      thumb: `/media/${img.thumb}`,
      w: img.w, h: img.h,
      caption: firstLine(strip(p.caption)) || place.name,
      date: p.timestamp,
      // The data export has no post links, so fall back to Harry's profile.
      permalink: p.permalink || site.instagram,
    })));
    const first = list.at(-1).timestamp, last = list[0].timestamp;
    const span = monthYear(first) === monthYear(last) ? monthYear(last) : `${monthYear(first)} – ${monthYear(last)}`;
    // Story: Harry's text if set, else the longest caption with hashtags removed.
    const story = place.story || list.map((p) => strip(p.caption)).sort((a, b) => b.length - a.length)[0] || '';
    series.push({
      slug: key,
      title: place.title || place.name.split(',')[0],
      place: place.name,
      lat: place.lat, lng: place.lng,
      tags: place.tags || [],
      story: story.length > 600 ? story.slice(0, 600).replace(/\s+\S*$/, '') + '…' : story,
      dates: span,
      latest: last,
      cover: photos.find((p) => p.id === place.cover) || photos[0],
      photos,
    });
  }
  return series.sort((a, b) => (a.latest < b.latest ? 1 : -1));
}

export const allTags = (series) => [...new Set(series.flatMap((s) => s.tags))].sort();

// Numbers for the landing and about pages.
export function getStats(series) {
  const photos = series.reduce((n, s) => n + s.photos.length, 0);
  const STATES = { California: 'United States', Nevada: 'United States', Idaho: 'United States' };
  const countries = new Set(series.filter((s) => s.place.includes(',')).map((s) => { const c = s.place.split(',').pop().trim(); return STATES[c] || c; }));
  const first = series.flatMap((s) => s.photos.map((p) => p.date)).sort()[0];
  return { places: series.length, photos, countries: countries.size, since: site.shootingSince || (first ? new Date(first).getFullYear() : null) };
}

// Banner photos: Harry's pick, else the cover of each of the busiest places that's wider than tall.
export function heroPhotos(series, slugs = [], n = 5) {
  const picked = slugs.length ? slugs.map((k) => series.find((s) => s.slug === k)).filter(Boolean)
    : [...series].sort((a, b) => b.photos.length - a.photos.length).filter((s) => s.cover.w >= s.cover.h * 1.15);
  return picked.slice(0, n).map((s) => ({ ...s.cover, place: s.title, slug: s.slug }));
}
