/**
 * يتحقّق أن التحديث المتفائل لزر الحضور يعمل:
 *   - الشارة تتغيّر في أقل من ١٠٠ms (قبل ردّ الخادم).
 *   - لا يُرسَل إلا طلبٌ واحد لكل ضغطة.
 *
 * لتشغيل محلياً:
 *   PLAYWRIGHT_BASE_URL=https://albrrak.vercel.app \
 *   PLAYWRIGHT_EMAIL=... PLAYWRIGHT_PASSWORD=... \
 *   npx playwright test e2e/attendance-optimistic.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// تسجيل الدخول عبر واجهة Supabase
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/البريد|email/i).fill(process.env.PLAYWRIGHT_EMAIL ?? "");
  await page.getByLabel(/كلمة المرور|password/i).fill(process.env.PLAYWRIGHT_PASSWORD ?? "");
  await page.getByRole("button", { name: /دخول|login/i }).click();
  await page.waitForURL(/admin|dashboard/, { timeout: 15_000 });
}

test.describe("زر الحضور — تحديث متفائل", () => {
  test.skip(!process.env.PLAYWRIGHT_EMAIL, "يحتاج PLAYWRIGHT_EMAIL و PLAYWRIGHT_PASSWORD");

  test("ضغطة واحدة تغيّر الشارة في أقل من ١٠٠ms ولا تُرسَل إلا مرّة واحدة", async ({ page }) => {
    await login(page);

    // — تأخير الخادم ٨٠٠ms للتحقّق من التحديث المتفائل قبل الرد —
    let attRequests = 0;
    await page.route("**/api/circles/*/mark-attendance", async (route) => {
      attRequests++;
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto(`${BASE}/admin/unified`);
    // انتظر تحميل قائمة الطلاب
    await page.waitForSelector('[data-testid="student-row"]', { timeout: 20_000 });

    // ابحث عن أوّل طالب بلا حضور (شارة «لم يُرفَع»)
    const unattended = page.locator('[data-testid="att-badge"]', { hasText: /لم يُرفَع/ }).first();
    const studentRow = unattended.locator("xpath=ancestor::*[@data-testid='student-row'][1]");
    // افتح لوحة الطالب
    await studentRow.click();

    const btn = page.locator('[data-testid="att-btn-PRESENT"]').first();
    await expect(btn).toBeVisible({ timeout: 5_000 });

    // اضغط وقِس الوقت حتى تتغيّر الشارة
    const start = Date.now();
    await btn.click();

    // الشارة يجب أن تتغيّر إلى «حاضر» قبل أن يرد الخادم (< 100ms)
    await expect(unattended).toContainText("حاضر", { timeout: 100 });
    const elapsed = Date.now() - start;

    expect(elapsed, `الشارة تغيّرت في ${elapsed}ms — يجب أن تكون < 100ms`).toBeLessThan(100);

    // انتظر انتهاء الطلب ثم تأكّد أنّه طلبٌ واحد فقط
    await page.waitForTimeout(1_200);
    expect(attRequests, "يجب إرسال طلبٍ واحد فقط").toBe(1);
  });
});
