// Service Worker موحَّد للمنصّة (PWA) — مكتوبٌ يدويًّا، بلا تبعية.
// النطاق "/". الإصدار من ?v=<SHA> في رابط التسجيل، فيُمسح الكاش القديم عند كل نشر.
//
// السياسة:
//   • الأصول الثابتة (/_next/static، /fonts، /png، /brand، الأيقونات، القالب): الكاش أوّلاً.
//   • التنقّل بين الصفحات: الشبكة أوّلاً ثمّ الكاش، وإلا صفحة «لا اتصال».
//   • لا يُخزَّن أبدًا: /api (إلا استثناء المُدَّكِر أدناه) ولا المصادقة (/login، /activate)
//     ولا الشاشة التحفيزيّة (/display — محتوًى حيّ) ولا أصل Supabase (عابرٌ للأصل أصلًا).
//   • استثناءٌ وحيد موثَّق (HANDOFF.md): GET /api/muddakir/today — شبكةٌ أوّلًا ثمّ الكاش،
//     ليعمل المُدَّكِر بلا إنترنت. مفتاحه مرتبطٌ بمعرّف المستخدم فلا يرى غيرُه خطّته،
//     ويُمسح كاش الـAPI كلّه عند تسجيل الخروج (رسالة من الصفحة).

const VERSION = new URL(self.location).searchParams.get("v") || "dev";
const STATIC_CACHE = `static:${VERSION}`;
const PAGE_CACHE = `pages:${VERSION}`;
const API_PREFIX = `api:${VERSION}:`; // + userId
const OFFLINE_URL = "/offline.html";

let currentUserId = "anon";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()).catch(() => {}),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      // امسح كلّ كاشٍ من إصدارٍ سابق (لا يحمل `:${VERSION}`).
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.endsWith(`:${VERSION}`) && !k.includes(`:${VERSION}:`)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (e) => {
  const data = e.data || {};
  if (data.type === "setUser") {
    currentUserId = typeof data.userId === "string" && data.userId ? data.userId : "anon";
  } else if (data.type === "clearApi") {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("api:")).map((k) => caches.delete(k)))));
  }
});

function isStatic(p) {
  return (
    p.startsWith("/_next/static/") ||
    p.startsWith("/fonts/") ||
    p.startsWith("/png/") ||
    p.startsWith("/brand/") ||
    p === "/app.webmanifest" ||
    p === "/offline.html" ||
    p === "/icon.svg" ||
    p === "/favicon.ico"
  );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // الكتابة للشبكة دائمًا
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase وغيره: عابرٌ للأصل، لا يُعترَض
  const p = url.pathname;

  // استثناء المُدَّكِر: خطّة اليوم — شبكةٌ أوّلًا ثمّ كاش المستخدم.
  if (p === "/api/muddakir/today") {
    const cacheName = API_PREFIX + currentUserId;
    e.respondWith(
      fetch(req)
        .then((r) => { const copy = r.clone(); caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {}); return r; })
        .catch(() => caches.open(cacheName).then((c) => c.match(req)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // لا تخزين للـAPI الأخرى ولا المصادقة ولا الشاشة التحفيزيّة: اتركها للشبكة.
  if (p.startsWith("/api/") || p === "/login" || p === "/activate" || p.startsWith("/display")) return;

  // الأصول الثابتة: الكاش أوّلًا.
  if (isStatic(p)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(STATIC_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return r;
      })),
    );
    return;
  }

  // التنقّل بين الصفحات: الشبكة أوّلًا، ثمّ الكاش، ثمّ صفحة «لا اتصال».
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const copy = r.clone(); caches.open(PAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {}); return r; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
    return;
  }
});
