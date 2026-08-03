/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // حزم Chromium/puppeteer تبقى خارجية (لا تُحزَم) — يستخدمها مولّد الشهادات (src/server/certificate.ts).
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // ملاحظة لـم٥: أيّ مسار (route) يستدعي renderCertificatePng يجب أن يضيف outputFileTracingIncludes
  // لمفتاح مساره: ["./public/fonts/IBMPlexSansArabic-*.ttf", "./node_modules/@sparticuz/chromium/bin/**"]
  // وإلا فشل على Vercel بـ: "chromium/bin does not exist". (تفصيله في README.)
};

export default nextConfig;
