/* Voices from the Archive — service worker.
   App shell offline-first; episodes.json stale-while-revalidate.
   Audio: network-first passthrough (streaming stays native), with cache
   fallback to explicit offline downloads, including Range support. */
const CACHE = 'wfw-shell-v2';
const AUDIO = 'wfw-audio-v1';
const SHELL = ['./', './index.html', './episodes.json', './manifest.webmanifest'];
// Audio lives in a separate repo (GitHub Pages caps sites at 1 GB).
// raw.githubusercontent.com serves CORS * and Range, so offline cache + seeking work.
const AUDIO_HOST = 'raw.githubusercontent.com';
const AUDIO_REPO = 'vy6ycr7tcc-debug/voices-from-the-archive-audio';
const AUDIO_BASE = 'https://' + AUDIO_HOST + '/' + AUDIO_REPO + '/main/audio/';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function audioHeaders(extra) {
  return Object.assign(
    {'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes'}, extra || {});
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  const sameOrigin = url.origin === self.location.origin;
  const isAudioHost = url.host === AUDIO_HOST;
  if (!sameOrigin && !isAudioHost) return;

  // Audio: try the network first (native streaming behavior), fall back to an
  // explicit offline download when the network is unreachable.
  if ((req.destination === 'audio' || url.pathname.endsWith('.mp3')) && (sameOrigin || isAudioHost)) {
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const cache = await caches.open(AUDIO);
        const hit = await cache.match(url.href);
        if (!hit) throw err;
        const range = req.headers.get('range');
        if (!range) return hit;
        const m = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
        const buf = await hit.arrayBuffer();
        if (!m) return new Response(buf, {headers: audioHeaders()});
        const start = parseInt(m[1], 10);
        const end = m[2] === '' ? buf.byteLength - 1 : parseInt(m[2], 10);
        if (start >= buf.byteLength) return new Response(null, {status: 416});
        const last = Math.min(end, buf.byteLength - 1);
        return new Response(buf.slice(start, last + 1), {
          status: 206,
          headers: audioHeaders({
            'Content-Length': String(last - start + 1),
            'Content-Range': 'bytes ' + start + '-' + last + '/' + buf.byteLength,
          }),
        });
      }
    })());
    return;
  }

  // Navigations: network first, fall back to cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Everything else: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
