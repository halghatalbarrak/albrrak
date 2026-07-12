/* ============================================================
   Service Worker — يجعل المنصة تعمل دون اتصال (Offline-first)
   الاستراتيجية: «الشبكة أولاً» لصفحات وملفات الموقع (فتظهر أحدث نسخة
   فور نشرها عند وجود اتصال)، ومع غياب الشبكة نخدم آخر نسخة محفوظة.
   نداءات Supabase تمرّ للشبكة دائماً (تُدار المزامنة في db.js).
   ============================================================ */
const CACHE = 'albrrak-v2';
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

  // نفس الأصل (هيكل التطبيق): الشبكة أولاً ثم الذاكرة كخطة بديلة عند الانقطاع.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // موارد خارجية (خطوط، Supabase SDK): الشبكة أولاً ثم الذاكرة كخطة بديلة.
  e.respondWith(fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
    return res;
  }).catch(() => caches.match(req)));
});
