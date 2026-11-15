/**
 * يفشل إن أُضيف route بلا requireAuth أو requireRoles (أو حارس معترَف به).
 * الاستثناءات الصريحة: routes عامّة بحارس بديل (token / CRON_SECRET / method محدَّد).
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// Routes عامّة بشكل مقصود (بلا requireAuth/requireRoles) — مع سبب موثَّق
const PUBLIC_ROUTES = new Set([
  "activate/route.ts",              // تفعيل بريمز بـtoken لمرّة واحدة
  "display/[token]/route.ts",       // شاشة التلفاز: token مشفَّر يحمي
  "registration-options/route.ts",  // قوائم نموذج القيد — قراءة عامّة بلا بيانات حساسة
  "verify/[token]/route.ts",        // تحقّق الشهادة — token عامّ بلا معرّفات داخلية
  "cron/weekly-reports/route.ts",   // محمي بـCRON_SECRET header لا بـrequireAuth
]);

// Routes مختلطة: بعض methods محميّ وبعضها عامّ — الحارس يغطّي جزءاً منها
const PARTIAL_ROUTES = new Set([
  "applications/route.ts", // POST = عامّ (نموذج القيد)؛ GET = requireRoles
]);

function findAllRoutes(dir: string, base = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) {
      results.push(...findAllRoutes(full, rel));
    } else if (entry === "route.ts") {
      results.push(rel);
    }
  }
  return results;
}

const AUTH_PATTERNS = [
  /requireAuth\s*\(/,
  /requireRoles\s*\(/,
  /requireMuddakir\s*\(/,
  /CRON_SECRET/,         // cron routes
];

describe("route-auth-guard: كل route يجب أن تحتوي على حارس", () => {
  const apiDir = join(process.cwd(), "src/app/api");
  const routes = findAllRoutes(apiDir);

  it("يجد routes على الإطلاق (sanity check)", () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it("كل route غير عامّة تستدعي requireAuth أو requireRoles أو requireMuddakir", () => {
    const unprotected: string[] = [];
    for (const rel of routes) {
      if (PUBLIC_ROUTES.has(rel) || PARTIAL_ROUTES.has(rel)) continue;
      const content = readFileSync(join(apiDir, rel), "utf-8");
      const hasGuard = AUTH_PATTERNS.some((p) => p.test(content));
      if (!hasGuard) unprotected.push(rel);
    }
    if (unprotected.length > 0) {
      console.error(
        "Routes بلا حارس (أضفها إلى PUBLIC_ROUTES أو PARTIAL_ROUTES إن كانت عامّة بالقصد):\n" +
          unprotected.map((r) => `  - ${r}`).join("\n"),
      );
    }
    expect(unprotected).toEqual([]);
  });
});
