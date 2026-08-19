/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // حزم Chromium/puppeteer تبقى خارجية (لا تُحزَم) — يستخدمها مولّد الشهادات (src/server/certificate.ts).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // م٥: مسار توليد صورة الشهادة يقرأ ملفّات من public/ (خطوط + شعار) ويحتاج ثنائيّة
  // Chromium — و«public/» لا تُحزَم في دالّة Vercel تلقائياً. نُجبر تتبّع الملفّات
  // لتُضمَّن في حزمة الدالّة، وإلا فشل التوليد على Vercel (ENOENT للخطوط / "chromium/bin
  // does not exist"). يشمل مسار الصورة فقط — لا نُثقِل بقيّة الدوالّ. (تفصيله في README.)
  outputFileTracingIncludes: {
    // نمطٌ عامّ (لا "[id]" حرفيّاً — إذ يُفسَّر صنفَ محارف في picomatch فلا يطابق).
    "/api/certificates/**": [
      "./public/fonts/IBMPlexSansArabic-*.ttf",
      "./public/png/logo.jpeg",
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
