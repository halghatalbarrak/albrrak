// شاهدٌ (tombstone): حلّ محلَّ Service Worker المُدَّكِر القديم. الآن الـSW موحَّدٌ للمنصّة في
// /sw.js (يحوي استثناء /api/muddakir/today نفسه). هذا الملفّ يُلغي تسجيل أيّ نسخةٍ قديمة
// سجّلها جهازٌ سابقًا ويمسح كاشها، فتتنظّف الأجهزة تلقائيًّا. لا يُسجَّل من أيّ صفحةٍ بعد الآن.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith("muddakir")).map((k) => caches.delete(k)));
        await self.registration.unregister();
        const clients = await self.clients.matchAll();
        clients.forEach((c) => "navigate" in c && c.navigate(c.url));
      } catch { /* لا بأس */ }
    })(),
  );
});
