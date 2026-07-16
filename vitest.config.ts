import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // اختبارات القاعدة تتشارك عميلًا واحدًا وقاعدة واحدة ⟵ تسلسليّة لتفادي التسابق.
    fileParallelism: false,
  },
});
