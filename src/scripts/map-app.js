import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const { series: SERIES, site } = JSON.parse(document.getElementById('series-data').textContent);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const coord = (lat, lng) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;
const day = (iso) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Melbourne' });
const isPhone = () => innerWidth <= 760;
const canHover = matchMedia('(hover: hover)').matches;
function dist(a, b) { const R = 6371, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t; const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
const clearHash = () => history.replaceState(null, '', location.pathname + location.search);

let map, current = null, filter = 'All';
const visible = () => SERIES.filter((s) => filter === 'All' || s.tags.includes(filter));

/* ---------- map ---------- */
// If the hosted map style can't load (offline, blocked, provider down), fall back to plain coastlines.
const FALLBACK_STYLE = {
  version: 8,
  sources: { land: { type: 'geojson', data: window.__FALLBACK_LAND || '/fallback-land.json' } },
  layers: [
    { id: 'sea', type: 'background', paint: { 'background-color': '#d6dfe3' } },
    { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#f5f5f2', 'fill-outline-color': '#c3ccd0' } },
  ],
};

function initMap() {
  const list = visible();
  const bounds = list.reduce((b, s) => b.extend([s.lng, s.lat]), new maplibregl.LngLatBounds([list[0].lng, list[0].lat], [list[0].lng, list[0].lat]));
  map = new maplibregl.Map({
    container: 'map', style: site.mapStyle === 'fallback' ? FALLBACK_STYLE : site.mapStyle, bounds, fitBoundsOptions: { padding: isPhone() ? { top: 140, bottom: 190, left: 48, right: 48 } : { top: 120, bottom: 80, left: 60, right: 60 }, maxZoom: 6 },
    minZoom: 0.3, maxZoom: 15, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false, renderWorldCopies: false,
  });
  map.touchZoomRotate.disableRotation();
  if (!isPhone()) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  let loaded = false;
  const fallback = () => { if (loaded) return; loaded = true; console.warn('Map style unavailable, using fallback coastlines.'); map.setStyle(FALLBACK_STYLE); map.once('style.load', ready); };
  const timer = setTimeout(fallback, 8000);
  map.on('error', (e) => { if (!loaded && !map.isStyleLoaded()) { clearTimeout(timer); fallback(); } });
  map.once('load', () => { if (loaded) return; loaded = true; clearTimeout(timer); ready(); });
  map.on('move', updateMarkers);
}
function ready() { updateMarkers(); route(); }

// HTML markers that follow the clustered source: a photo pin per place, a numbered stack per cluster.
const markers = new Map();
function pinEl(s) {
  const el = document.createElement('div');
  el.className = 'pinwrap';
  el.innerHTML = `<div class="pin" data-id="${s.slug}"><img alt="" src="${s.cover.thumb}"></div><span class="n">${s.photos.length}</span>${canHover ? `<span class="pin-tip">${esc(s.title)}<small>${esc(s.place)}</small></span>` : ''}`;
  el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `${s.title}, ${s.place}`);
  const open = (e) => { e.stopPropagation(); location.hash = s.slug; };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  return el;
}
function clusterEl(group) {
  const el = document.createElement('div');
  el.className = 'cl';
  el.innerHTML = `<div class="stack"></div><div class="pin"><img alt="" src="${group[0].cover.thumb}"></div><b>${group.length}</b>`;
  el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', `${group.length} places, zoom in`);
  const zoom = (e) => {
    e.stopPropagation();
    const b = group.reduce((bb, s) => bb.extend([s.lng, s.lat]), new maplibregl.LngLatBounds());
    map.fitBounds(b, { padding: 90, maxZoom: map.getZoom() + 4, duration: 700 });
  };
  el.addEventListener('click', zoom);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') zoom(e); });
  return el;
}
// Places that would overlap on screen are grouped into one numbered stack (newest place on top).
const CLUSTER_PX = 56;
function updateMarkers() {
  if (!map) return;
  const groups = [];
  for (const s of visible()) { // already newest first
    const pt = map.project([s.lng, s.lat]);
    const g = groups.find((g) => Math.hypot(g.x - pt.x, g.y - pt.y) < CLUSTER_PX);
    if (g) g.list.push(s); else groups.push({ x: pt.x, y: pt.y, list: [s] });
  }
  const seen = new Set();
  for (const g of groups) {
    const one = g.list.length === 1;
    const key = one ? g.list[0].slug : 'c:' + g.list.map((s) => s.slug).join('|');
    seen.add(key);
    const lngLat = one ? [g.list[0].lng, g.list[0].lat] : map.unproject([g.x, g.y]);
    if (!markers.has(key)) {
      const el = one ? pinEl(g.list[0]) : clusterEl(g.list);
      markers.set(key, new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map));
    } else if (!one) markers.get(key).setLngLat(lngLat);
  }
  for (const [key, m] of markers) if (!seen.has(key)) { m.remove(); markers.delete(key); }
  if (current) markActive(current.slug);
}
function markActive(slug) {
  document.querySelectorAll('.pin.active').forEach((p) => p.classList.remove('active'));
  document.querySelector(`.pin[data-id="${slug}"]`)?.classList.add('active');
}
// Fly to a place, centred in whatever part of the map is still visible beside or above the panel.
function focusPlace(s, zoom, duration) {
  let offset = [0, 0];
  if (!isPhone()) offset = [current ? -230 : 0, 20];
  else {
    const top = current ? innerHeight - $('#panel').offsetHeight + sheetPos(sheetState) : innerHeight - 150;
    offset = [0, (64 + top) / 2 - innerHeight / 2];
  }
  map.flyTo({ center: [s.lng, s.lat], zoom, offset, duration: duration * 1000, essential: true });
}

/* ---------- filters + list ---------- */
$('#chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]'); if (!b) return;
  filter = b.dataset.c;
  document.querySelectorAll('#chips .chip').forEach((c) => c.setAttribute('aria-pressed', c === b));
  updateMarkers();
  markers.forEach((m) => m.remove()); markers.clear();
  const n = visible().length;
  $('#introTitle').textContent = filter === 'All' ? `Photographs from ${SERIES.length} places` : `${n} ${filter.toLowerCase()} ${n === 1 ? 'place' : 'places'}`;
  document.querySelectorAll('#listGrid .card').forEach((c) => { c.hidden = filter !== 'All' && !c.dataset.tags.split('|').includes(filter); });
  renderStrip();
  if (!current && n) {
    const b2 = visible().reduce((bb, s) => bb.extend([s.lng, s.lat]), new maplibregl.LngLatBounds());
    map.fitBounds(b2, { padding: { top: 120, bottom: isPhone() ? 200 : 80, left: 60, right: 60 }, maxZoom: 9, duration: 800 });
  }
});
function setList(on) { $('#list').hidden = !on; $('#listBtn').setAttribute('aria-pressed', on); $('#listBtn').textContent = on ? 'Map' : 'List'; }
$('#listBtn').onclick = () => setList($('#list').hidden);
$('#listGrid').addEventListener('click', (e) => {
  const a = e.target.closest('[data-id]'); if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault(); setList(false); location.hash = a.dataset.id;
});

/* ---------- series panel ---------- */
const nearest = (s, n = 2) => SERIES.filter((x) => x !== s).map((x) => ({ x, d: dist(s, x) })).sort((a, b) => a.d - b.d).slice(0, n);
function openSeries(slug) {
  const s = SERIES.find((x) => x.slug === slug); if (!s) return closeSeries();
  current = s;
  const p = $('#panel');
  p.innerHTML = `<div class="grab" aria-hidden="true"><span></span></div><div class="panel-scroll">
    <div class="cover"><img alt="${esc(s.cover.caption)}" src="${s.cover.src}" data-i="${s.photos.indexOf(s.cover)}"></div>
    <button class="iconbtn close" aria-label="Close">✕</button>
    <div class="ph ph-head"><div class="where"><span>${esc(s.place)}</span><span class="mono">${coord(s.lat, s.lng)}</span></div><h2>${esc(s.title)}</h2></div>
    <div class="ph ph-body">${s.story ? `<p class="story">${esc(s.story).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="tags">${s.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}<span class="tag">${esc(s.dates)}</span><span class="tag">${s.photos.length} photos</span></div></div>
    <div class="grid">${s.photos.map((ph, i) => `<button data-i="${i}" aria-label="Open ${esc(ph.caption)}"><img alt="" loading="lazy" src="${ph.thumb}" width="${ph.w}" height="${ph.h}"><span class="cap">${esc(ph.caption)}</span></button>`).join('')}</div>
    <div class="nextrow">${nearest(s).map(({ x, d }) => `<button data-go="${x.slug}"><small>Nearby · ${Math.round(d).toLocaleString('en-AU')} km</small><b>${esc(x.title)}</b></button>`).join('')}</div>
    <a class="insta" href="/places/${s.slug}/">Page for this place (to share) →</a></div>`;
  p.classList.add('open'); p.setAttribute('aria-hidden', 'false'); $('#app').classList.add('app-series-open');
  p.querySelector('.close').onclick = () => { clearHash(); closeSeries(); };
  p.onclick = (e) => {
    if (dragMoved) { dragMoved = false; return; }
    const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; return; }
    const im = e.target.closest('[data-i]'); if (!im) return;
    if (isPhone() && sheetState !== 'full' && !e.target.closest('.grid')) { setSheet('full'); return; }
    openLightbox(s, +im.dataset.i);
  };
  p.querySelector('.panel-scroll').scrollTop = 0;
  if (isPhone()) setSheet('half'); else p.style.transform = '';
  focusPlace(s, Math.max(map.getZoom(), 9), 1.2);
  document.title = `${s.title} · ${site.name}`;
}
function closeSeries() {
  current = null;
  const p = $('#panel'); p.classList.remove('open'); p.style.transform = ''; p.setAttribute('aria-hidden', 'true');
  $('#app').classList.remove('app-series-open'); markActive(null);
  document.title = document.title.replace(/^.* · /, `${site.name} · `);
}

/* ---------- phone: draggable bottom sheet ---------- */
let sheetState = 'half', dragMoved = false;
const sheetPos = (st) => { const h = $('#panel').offsetHeight; return st === 'peek' ? h - 128 : st === 'half' ? Math.round(h * 0.46) : 0; };
function setSheet(st) { sheetState = st; const p = $('#panel'); p.dataset.state = st; p.style.transform = `translateY(${sheetPos(st)}px)`; if (st !== 'full') p.querySelector('.panel-scroll').scrollTop = 0; }
(() => {
  const p = $('#panel'); let y0 = null, base = 0, last = 0, lastT = 0, v = 0;
  p.addEventListener('pointerdown', (e) => { if (!isPhone() || !current) return; if (sheetState === 'full' && !e.target.closest('.grab')) return; y0 = e.clientY; base = sheetPos(sheetState); last = e.clientY; lastT = e.timeStamp; v = 0; dragMoved = false; });
  p.addEventListener('pointermove', (e) => {
    if (y0 == null) return; const dy = e.clientY - y0; if (!dragMoved && Math.abs(dy) < 8) return;
    if (!dragMoved) { dragMoved = true; p.classList.add('dragging'); try { p.setPointerCapture(e.pointerId); } catch {} }
    v = (e.clientY - last) / Math.max(1, e.timeStamp - lastT); last = e.clientY; lastT = e.timeStamp;
    p.style.transform = `translateY(${Math.max(0, base + dy)}px)`;
  });
  const end = (e) => {
    if (y0 == null) return; p.classList.remove('dragging'); const dy = e.clientY - y0; y0 = null; if (!dragMoved) return;
    const y = Math.max(0, base + dy), h = p.offsetHeight;
    if (y > h - 90 || (sheetState === 'peek' && v > 0.6)) { clearHash(); closeSeries(); return; }
    let st = [['full', 0], ['half', sheetPos('half')], ['peek', sheetPos('peek')]].sort((a, b) => Math.abs(a[1] - y) - Math.abs(b[1] - y))[0][0];
    if (v < -0.5) st = sheetState === 'peek' ? 'half' : 'full'; else if (v > 0.5) st = sheetState === 'full' ? 'half' : 'peek';
    setSheet(st); setTimeout(() => { dragMoved = false; }, 50);
  };
  p.addEventListener('pointerup', end); p.addEventListener('pointercancel', end);
  p.addEventListener('click', (e) => { if (e.target.closest('.grab') && !dragMoved) setSheet(sheetState === 'full' ? 'half' : 'full'); });
})();
addEventListener('resize', () => { if (!current) return; if (isPhone()) setSheet(sheetState); else $('#panel').style.transform = ''; });

/* ---------- phone: place strip synced with the map ---------- */
let stripTimer, stripCur = null;
function renderStrip() {
  const v = visible();
  $('#stripLabel').textContent = `${v.length} places · swipe or tap a pin`;
  $('#strip').innerHTML = v.map((s) => `<button data-id="${s.slug}"><img alt="" src="${s.cover.thumb}"><div><b>${esc(s.title)}</b><span>${esc(s.place)}</span><span>${s.photos.length} photos · ${esc(s.dates)}</span></div></button>`).join('');
  stripCur = null;
}
$('#strip').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) location.hash = b.dataset.id; });
$('#strip').addEventListener('scroll', () => {
  clearTimeout(stripTimer);
  if (current || !$('#strip').offsetParent) return;
  stripTimer = setTimeout(() => {
    if (current) return;
    const st = $('#strip'), mid = st.scrollLeft + st.clientWidth / 2;
    let best = null, bd = 1e9;
    st.querySelectorAll('button').forEach((b) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = b; } });
    if (!best || best.dataset.id === stripCur) return;
    stripCur = best.dataset.id;
    st.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', b === best));
    const s = SERIES.find((x) => x.slug === stripCur);
    focusPlace(s, 8, 0.8); setTimeout(() => markActive(s.slug), 900);
  }, 140);
}, { passive: true });

/* ---------- photo viewer ---------- */
let lb = { s: null, i: 0 }, lbInfo = false;
function openLightbox(s, i) { lb = { s, i }; lbInfo = false; renderLB(); $('#lb').hidden = false; $('#lb .x').focus(); }
function renderLB() {
  const { s, i } = lb, ph = s.photos[i];
  // The request carries the photo itself (and its Instagram post when we know it) so Harry sees exactly which one.
  const q = new URLSearchParams({ topic: 'Print enquiry', photo: `${ph.caption} (${s.title})`, img: ph.src, place: s.slug });
  if (ph.permalink && ph.permalink !== site.instagram) q.set('ig', ph.permalink);
  const enquire = `/contact/?${q}`;
  $('#lb').innerHTML = `<div class="lb-stage"><img alt="${esc(ph.caption)}" src="${ph.src}" width="${ph.w}" height="${ph.h}">
     <button class="iconbtn x" aria-label="Close photo">✕</button>
     <button class="iconbtn prev" aria-label="Previous photo">‹</button><button class="iconbtn next" aria-label="Next photo">›</button></div>
   <div class="lb-bar"><div><b>${esc(ph.caption)}</b><span>${i + 1} / ${s.photos.length} · ${day(ph.date)}</span></div><button class="primary" id="infoBtn">Details</button></div>
   <div class="lb-side" aria-label="Photo details">
     <div class="sheet-head"><b>Details</b><button id="infoClose" aria-label="Back to photo">✕</button></div>
     <div><h3>${esc(ph.caption)}</h3><div class="sub" style="margin-top:8px"><span>${esc(s.title)} · ${esc(s.place)}</span><span class="mono exif">${day(ph.date)}</span><span class="mono exif">${i + 1} / ${s.photos.length}</span><span class="mono hint">← → to browse · Esc to close</span></div></div>
     <div class="lb-links">
       <a class="primary-link" href="${enquire}">Ask about a print <span>✉</span></a>
       <a href="${ph.permalink}" target="_blank" rel="noopener">View on Instagram <span>↗</span></a>
       <a href="/places/${s.slug}/">Page for this place <span>→</span></a>
     </div>
     <p class="note">Prints are made by ${esc(site.name)}. Email to ask about sizes and prices.</p>
   </div>`;
  const el = $('#lb'); el.classList.toggle('opts', lbInfo);
  el.querySelector('.x').onclick = closeLB;
  el.querySelector('.prev').onclick = () => step(-1);
  el.querySelector('.next').onclick = () => step(1);
  $('#infoBtn').onclick = () => { lbInfo = true; el.classList.add('opts'); };
  $('#infoClose').onclick = () => { lbInfo = false; el.classList.remove('opts'); };
  // Warm the next image so swiping feels instant.
  const nx = s.photos[(i + 1) % s.photos.length]; if (nx) new Image().src = nx.src;
}
function step(d) { const n = lb.s.photos.length; lb.i = (lb.i + d + n) % n; renderLB(); }
function closeLB() { if (lbInfo && isPhone()) { lbInfo = false; $('#lb').classList.remove('opts'); return; } $('#lb').hidden = true; }
let tx = null;
$('#lb').addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
$('#lb').addEventListener('touchend', (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50 && e.target.closest('.lb-stage')) step(dx < 0 ? 1 : -1); tx = null; });

/* ---------- routing + keys ---------- */
function route() { const id = decodeURIComponent(location.hash.slice(1)); if (id && SERIES.some((s) => s.slug === id)) { $('#lb').hidden = true; openSeries(id); } else closeSeries(); }
addEventListener('hashchange', route);
addEventListener('keydown', (e) => {
  if (!$('#lb').hidden) { if (e.key === 'Escape') closeLB(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); return; }
  if (e.key === 'Escape' && current) { clearHash(); closeSeries(); }
});

renderStrip();
if (SERIES.length) initMap();
