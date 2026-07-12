/* ============================================================
   Service Worker — يجعل المنصة تعمل دون اتصال (Offline-first)
   نُخزّن هيكل التطبيق (App Shell) ونخدمه من الذاكرة عند غياب الشبكة،
   ونترك نداءات Supabase تمرّ عبر الشبكة دائماً (تُدار المزامنة في db.js).
   ============================================================ */
const CACHE = 'albrrak-v1';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './assets/favicon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // لا نتدخّل في نداءات قاعدة البيانات أو المصادقة — تمرّ للشبكة مباشرة.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // هيكل التطبيق ونفس الأصل: من الذاكرة أولاً ثم تحديثها من الشبكة (stale-while-revalidate).
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // موارد خارجية (خطوط، Supabase SDK): من الشبكة ثم الذاكرة كخطة بديلة.
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});
