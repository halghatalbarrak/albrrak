/**
 * يتحقّق أن شاشة الموحّدة لا تُطلق أكثر من MAX_API_REQUESTS طلباً على /api/
 * عند التحميل الأوّلي (قبل فتح أيّ بطاقة).
 *
 * الهدف: ≤15 طلباً (api فقط، دون الأصول الثابتة وملفّات JS).
 * يُخفَق إن تجاوز الطلبات بسبب حلقة N+1 أو جلب مبكّر للبيانات الثقيلة.
 */
import { test, expect } from "@playwright/test";

const MAX_API_REQUESTS = 15;

const MOCK_STUDENTS = Array.from({ length: 20 }, (_, i) => ({
  studentId: `s-${i + 1}`,
  name: `طالب ${i + 1}`,
  program: "MARAQI",
  attendanceStatus: i % 3 === 0 ? "PRESENT" : null,
  todayHifzDone: false,
  tarseekhDone: null,
  stageLabel: null,
  hizb: null,
  weeklyPercent: null,
  weeklyComplete: false,
  deferredToday: false,
  mustRepeat: false,
  started: true,
  yesterday: null,
  required: null,
}));

const FAKE_SESSION = JSON.stringify({
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-1", email: "t@t.com", role: "authenticated" },
});

test("تحميل شاشة الموحّدة لا يتجاوز الحدّ الأقصى للطلبات", async ({ page }) => {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);

  // ثبّت كل استجابات API
  await page.route("**/api/me", (r) => r.fulfill({ json: { name: "م", roles: ["TEACHER"] } }));
  await page.route("**/api/attendance/circles", (r) => r.fulfill({ json: { circles: [{ id: "c1", nameAr: "ح" }] } }));
  await page.route("**/api/economy/grant", (r) => r.fulfill({ json: { items: [] } }));
  await page.route("**/api/circles/c1/unified**", (r) => r.fulfill({ json: { students: MOCK_STUDENTS, absentDefault: false } }));
  // طلبات البطاقة per-student يجب ألّا تُطلَق عند التحميل الأوّلي (بلا فتح بطاقة).
  await page.route("**/api/students/**/unified-panel**", (r) => r.fulfill({ json: { today: { status: "ACTIVE", newHifz: null, tarseekh: [], murajaah: null, hasTarsikh: false, hasMuraja: false }, qaidah: null } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  const apiRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/")) apiRequests.push(url);
  });

  await page.goto("/admin/unified");

  // انتظر ظهور القائمة
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(20, { timeout: 15_000 });

  // أعطِ وقتاً إضافيّاً لأيّ طلباتٍ متأخّرة
  await page.waitForTimeout(1_000);

  expect(
    apiRequests.length,
    `${apiRequests.length} طلباً على /api/ — المسموح ${MAX_API_REQUESTS}:\n${apiRequests.join("\n")}`,
  ).toBeLessThanOrEqual(MAX_API_REQUESTS);
});
