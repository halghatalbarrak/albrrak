import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // JSX التلقائي (React 19) لاختبارات المكوّنات (.tsx).
  esbuild: { jsx: "automatic" },
  test: {
    // node افتراضيًّا (اختبارات القاعدة)؛ اختبارات المكوّنات تعلن jsdom بتعليقٍ في رأسها.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // اختبارات القاعدة تتشارك عميلًا واحدًا وقاعدة واحدة ⟵ تسلسليّة لتفادي التسابق.
    fileParallelism: false,
    // يُشعِل Postgres مدمجًا محليًّا مؤقّتًا (بلا Docker/إنترنت) ويطبّق الترحيلات.
    globalSetup: ["./vitest.global-setup.ts"],
    // بيئة الاختبار: القاعدة المحلية المؤقّتة (localhost ⟵ يقبلها صمّام الأمان)، وأسرارٌ
    // اختباريّة عابرة (ليست إنتاجيّة): تشفير الهوية، وسرّ JWT لاختبارات المصادقة.
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:54329/albrrak_test",
      DIRECT_URL: "postgresql://postgres:postgres@localhost:54329/albrrak_test",
      NATIONAL_ID_ENC_KEY: "LBGwjQPLd+P1XtYQ0sfL16wDLaD0T4S2uuhNqBL4j2U=",
      SUPABASE_JWT_SECRET: "albrrak-local-test-jwt-secret-not-production",
    },
  },
});
