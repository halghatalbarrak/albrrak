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
  },
});
