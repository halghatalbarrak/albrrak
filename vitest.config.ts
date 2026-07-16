import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // اختبارات القاعدة تتشارك عميلًا واحدًا وقاعدة واحدة ⟵ تسلسليّة لتفادي التسابق.
    fileParallelism: false,
  },
});
