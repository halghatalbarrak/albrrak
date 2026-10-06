// Service Worker للمُدَّكِر (§٨): يعمل بلا إنترنت. يُخزّن صدفة الشاشة وأصولها مسبقًا، وخطّة اليوم
// (GET /api/muddakir/today) بشبكةٍ أوّلًا ثمّ الكاش. أحداث الحافظ (POST) تمرّ للشبكة؛ وعند
// الانقطاع تبقى في طابور IndexedDB داخل الصفحة وتُرسَل عند عودة الاتّصال (idempotent على الخادم).
const CACHE = "muddakir-v1";
const SHELL = ["/muddakir", "/manifest.webmanifest", "/png/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

function cachePut(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // الأحداث POST للشبكة/الطابور — لا تُعترَض
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // خطّة اليوم: شبكةٌ أوّلًا، واحتياطيّها الكاش (محفوظة للعمل بلا إنترنت).
  if (url.pathname === "/api/muddakir/today") {
    e.respondWith(fetch(req).then((r) => cachePut(req, r)).catch(() => caches.match(req)));
    return;
  }
  // الصدفة والأصول الثابتة: الكاش أوّلًا، وإلا الشبكة (ثمّ تُخزَّن).
  if (url.pathname === "/muddakir" || url.pathname.startsWith("/_next/") || url.pathname.startsWith("/png/") || url.pathname.startsWith("/fonts/") || url.pathname === "/manifest.webmanifest") {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => cachePut(req, r)).catch(() => hit)));
    return;
  }
});
