/* ============================================================
   Service Worker — نسخة «ذاتية الإلغاء» (Kill-switch)
   الغرض: التعافي من أي تخزينٍ قديم عالق على أجهزة المستخدمين.
   عند تحديث هذا الملف، يمسح المتصفّح كل الذواكر ويُلغي تسجيل SW
   ويعيد تحميل الصفحات المفتوحة، فتُجلب أحدث نسخة من الشبكة مباشرةً.
   (العمل دون اتصال يبقى مؤمّناً في طبقة البيانات db.js — طابور المزامنة.)
   ============================================================ */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => { try { c.navigate(c.url); } catch (_) {} });
    } catch (_) {}
  })());
});

// لا نتدخّل في أي طلب — كل شيء يمرّ للشبكة مباشرةً.
