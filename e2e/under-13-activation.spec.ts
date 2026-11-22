/**
 * E2E — م٤: منع تفعيل حساب طالب عمره ١٠ سنوات.
 *
 * الطلبات مُزوَّرة (page.route) — لا اتّصال بقاعدة بيانات.
 * السيناريو: رابط التفعيل صالح (GET يُرجع purpose)، لكنّ POST يُرجع
 * خطأ م٤ (noLoginUnderThirteen) ← تظهر رسالة الخطأ في الصفحة.
 */
import { test, expect } from "@playwright/test";

const TOKEN = "under13-test-token";
const ERROR_MSG = "م٤: لا يُنشأ حساب دخول لمن دون الثالثة عشرة.";

test("م٤ — طالب عمره ١٠: رسالة الخطأ تظهر عند محاولة التفعيل", async ({ page }) => {
  // GET /api/activate → الرمز صالح
  await page.route(`**/api/activate*`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { purpose: "ACTIVATE" } });
    } else {
      // POST → خطأ م٤
      await route.fulfill({
        status: 400,
        json: { error: ERROR_MSG, key: "noLoginUnderThirteen" },
      });
    }
  });

  await page.goto(`/activate?token=${TOKEN}`);

  // انتظر ظهور حقلَي كلمة السرّ (الصفحة انتهت من التحقّق)
  await page.getByLabel("كلمة السرّ").first().waitFor({ state: "visible" });

  // ملء الحقلين
  await page.getByLabel("كلمة السرّ").first().fill("password123");
  await page.getByLabel("تأكيد كلمة السرّ").first().fill("password123");

  // إرسال
  await page.getByRole("button", { name: "حفظ والدخول" }).click();

  // التحقّق من ظهور رسالة الخطأ
  await expect(page.getByText(ERROR_MSG)).toBeVisible();
});
