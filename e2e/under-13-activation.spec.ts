/**
 * E2E — م٤: منع تفعيل حساب طالب عمره ١٠ ونجاح طالب عمره ١٤.
 *
 * الطلبات مُزوَّرة (page.route) — لا اتّصال بقاعدة بيانات.
 * الاختبار الحقيقيّ لمنطق العمر (١٠ مرفوض / ١٤ مقبول) موجودٌ في:
 *   src/server/__tests__/under-13.test.ts (يعمل على Postgres حقيقيّ في CI).
 */
import { test, expect } from "@playwright/test";

const TOKEN = "under13-test-token";
const ERROR_MSG = "م٤: لا يُنشأ حساب دخول لمن دون الثالثة عشرة.";

test("م٤ — طالب عمره ١٠: رسالة الخطأ تظهر عند محاولة التفعيل", async ({ page }) => {
  await page.route(`**/api/activate*`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { purpose: "ACTIVATE" } });
    } else {
      await route.fulfill({
        status: 400,
        json: { error: ERROR_MSG, key: "noLoginUnderThirteen" },
      });
    }
  });

  await page.goto(`/activate?token=${TOKEN}`);

  await page.getByLabel("كلمة السرّ").first().waitFor({ state: "visible" });
  await page.getByLabel("كلمة السرّ").first().fill("password123");
  await page.getByLabel("تأكيد كلمة السرّ").first().fill("password123");
  await page.getByRole("button", { name: "حفظ والدخول" }).click();

  await expect(page.getByText(ERROR_MSG)).toBeVisible();
});

test("م٤ — طالب عمره ١٤: التفعيل ينجح وتختفي رسالة الخطأ", async ({ page }) => {
  await page.route(`**/api/activate*`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { purpose: "ACTIVATE" } });
    } else {
      // POST ناجح — الخادم يُعيد 200 بلا خطأ
      await route.fulfill({ status: 200, json: {} });
    }
  });

  await page.goto(`/activate?token=${TOKEN}`);

  await page.getByLabel("كلمة السرّ").first().waitFor({ state: "visible" });
  await page.getByLabel("كلمة السرّ").first().fill("password123");
  await page.getByLabel("تأكيد كلمة السرّ").first().fill("password123");
  await page.getByRole("button", { name: "حفظ والدخول" }).click();

  // لا رسالة خطأ م٤
  await expect(page.getByText(ERROR_MSG)).not.toBeVisible();
});
