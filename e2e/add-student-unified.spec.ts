/**
 * E2E — إضافة طالب من الشاشة الموحّدة (البند ١٢)
 * يتحقّق من: ظهور الزر، فتح النموذج، إضافة ناجحة، الحقول الشرطيّة لكلّ برنامج.
 */
import { test, expect, type Page } from "@playwright/test";

const FAKE_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLXRlYWNoZXIiLCJleHAiOjk5OTk5OTk5OTl9.mock",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-teacher", email: "t@t.com", role: "authenticated" },
});

const CIRCLES = [{ id: "circle-1", nameAr: "الحلقة الأولى" }];
const PROGRAMS = [
  { id: "prog-1", key: "MARAQI", nameAr: "مراقي" },
  { id: "prog-2", key: "QAIDAH_MADANIYYAH", nameAr: "القاعدة المدنيّة" },
  { id: "prog-3", key: "MUDDAKIR", nameAr: "مُدّكِر" },
];

const BASE_STUDENTS = [
  {
    studentId: "std-existing",
    name: "عليّ",
    program: "MARAQI",
    attendanceStatus: null,
    todayHifzDone: false,
    tarseekhDone: null,
    setupStatus: { isComplete: true, blockers: [], warnings: [] },
    stageLabel: null,
    hizb: null,
    weeklyPercent: null,
    weeklyComplete: false,
    deferredToday: false,
    mustRepeat: false,
    started: true,
    yesterday: null,
    required: null,
  },
];

const NEW_STUDENT = {
  studentId: "std-new",
  name: "أحمد الجديد",
  program: "MARAQI",
  attendanceStatus: null,
  todayHifzDone: false,
  tarseekhDone: null,
  setupStatus: { isComplete: true, blockers: [], warnings: [] },
  stageLabel: "البقرة",
  hizb: 1,
  weeklyPercent: null,
  weeklyComplete: false,
  deferredToday: false,
  mustRepeat: false,
  started: true,
  yesterday: null,
  required: { hifz: "البقرة ١–٥", tarsikh: null, murajaah: null },
};

async function setupMocks(page: Page, addResult = { studentId: "std-new", duplicate: false }) {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "user-teacher", name: "معلّم", roles: ["TEACHER"], email: "t@t.com" }),
    });
  });

  await page.route("**/api/economy/grant**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
  });

  await page.route("**/api/attendance/circles**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ circles: CIRCLES }),
    });
  });

  await page.route("**/api/programs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ programs: PROGRAMS }),
    });
  });

  let callCount = 0;
  await page.route("**/api/circles/circle-1/unified**", async (route) => {
    callCount++;
    const students = callCount === 1 ? BASE_STUDENTS : [...BASE_STUDENTS, NEW_STUDENT];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        students,
        absentDefault: false,
        dayLock: { state: "OPEN", locked: false, date: "2026-11-22" },
      }),
    });
  });

  await page.route("**/api/circles/circle-1/add-student", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          lessons: [
            { id: "les-1", nameAr: "الدرس الأوّل", chapterName: "الباب الأوّل" },
            { id: "les-2", nameAr: "الدرس الثاني", chapterName: "الباب الأوّل" },
            { id: "les-3", nameAr: "الدرس الثالث", chapterName: "الباب الثاني" },
          ],
        }),
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(addResult),
      });
    }
  });
}

test.describe("إضافة طالب من الشاشة الموحّدة", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/admin/unified");
  });

  test("يظهر زر «+ إضافة طالب»", async ({ page }) => {
    await expect(page.locator("[data-testid='add-student-btn']")).toBeVisible({ timeout: 8000 });
  });

  test("فتح النموذج والإضافة", async ({ page }) => {
    await page.locator("[data-testid='add-student-btn']").click();
    await expect(page.locator("[data-testid='add-student-form']")).toBeVisible();

    await page.locator("[data-testid='add-student-name']").fill("أحمد الجديد");
    await page.locator("[data-testid='add-student-dob-day']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-month']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-year']").selectOption("2010");
    await page.locator("[data-testid='add-student-guardian-phone']").fill("0512345678");

    await page.locator("[data-testid='add-student-submit']").click();

    // بعد الإضافة: النموذج يُخفى ورسالة النجاح
    await expect(page.locator("[data-testid='add-student-form']")).not.toBeVisible({ timeout: 6000 });
  });

  test("الطالب يظهر في القائمة بعد الإضافة بلا «إعداد ناقص»", async ({ page }) => {
    await page.locator("[data-testid='add-student-btn']").click();
    await page.locator("[data-testid='add-student-name']").fill("أحمد الجديد");
    await page.locator("[data-testid='add-student-dob-day']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-month']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-year']").selectOption("2010");
    await page.locator("[data-testid='add-student-guardian-phone']").fill("0512345678");
    await page.locator("[data-testid='add-student-submit']").click();

    // بعد إعادة التحميل: الطالب الجديد يظهر، ولا «إعداد ناقص»
    await expect(page.getByText("أحمد الجديد").first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("إعداد ناقص")).not.toBeVisible();
  });

  test("النموذج يظهر على شاشة 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-testid='add-student-btn']").waitFor({ state: "visible", timeout: 8000 });
    await page.locator("[data-testid='add-student-btn']").click();
    await expect(page.locator("[data-testid='add-student-form']")).toBeVisible({ timeout: 5000 });
  });

  test("مراقي: تظهر حقول الموضع عند اختيار البرنامج ثمّ تُحفظ بلا إعداد ناقص", async ({ page }) => {
    await page.locator("[data-testid='add-student-btn']").click();
    await page.locator("[data-testid='add-student-name']").fill("طالب مراقي");
    await page.locator("[data-testid='add-student-dob-day']").selectOption("5");
    await page.locator("[data-testid='add-student-dob-month']").selectOption("3");
    await page.locator("[data-testid='add-student-dob-year']").selectOption("2012");
    await page.locator("[data-testid='add-student-guardian-phone']").fill("0512345678");
    await page.locator("[data-testid='add-student-program']").selectOption("prog-1");

    // حقول مراقي ظاهرة
    await expect(page.locator("[data-testid='add-student-maraqi-fields']")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[data-testid='surah-select']")).toBeVisible();
    await expect(page.locator("[data-testid='ayah-select']")).toBeVisible();

    await page.locator("[data-testid='add-student-submit']").click();
    await expect(page.locator("[data-testid='add-student-form']")).not.toBeVisible({ timeout: 6000 });
    await expect(page.getByText("إعداد ناقص")).not.toBeVisible();
  });

  test("القاعدة المدنيّة: يظهر حقل الدرس عند اختيار البرنامج ثمّ يُحفظ", async ({ page }) => {
    await page.locator("[data-testid='add-student-btn']").click();
    await page.locator("[data-testid='add-student-name']").fill("طالب قاعدة");
    await page.locator("[data-testid='add-student-dob-day']").selectOption("3");
    await page.locator("[data-testid='add-student-dob-month']").selectOption("6");
    await page.locator("[data-testid='add-student-dob-year']").selectOption("2014");
    await page.locator("[data-testid='add-student-guardian-phone']").fill("0512345679");
    await page.locator("[data-testid='add-student-program']").selectOption("prog-2");

    // حقل الدرس ظاهر
    await expect(page.locator("[data-testid='add-student-qaidah-fields']")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[data-testid='add-student-qaidah-lesson']")).toBeVisible({ timeout: 5000 });
    await page.locator("[data-testid='add-student-qaidah-lesson']").selectOption("les-2");

    await page.locator("[data-testid='add-student-submit']").click();
    await expect(page.locator("[data-testid='add-student-form']")).not.toBeVisible({ timeout: 6000 });
    await expect(page.getByText("إعداد ناقص")).not.toBeVisible();
  });

  test("مُدّكِر: تظهر حقول المسار عند اختيار البرنامج ثمّ تُحفظ", async ({ page }) => {
    await page.locator("[data-testid='add-student-btn']").click();
    await page.locator("[data-testid='add-student-name']").fill("طالب مدّكر");
    await page.locator("[data-testid='add-student-dob-day']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-month']").selectOption("1");
    await page.locator("[data-testid='add-student-dob-year']").selectOption("2008");
    await page.locator("[data-testid='add-student-guardian-phone']").fill("0512345680");
    await page.locator("[data-testid='add-student-program']").selectOption("prog-3");

    // حقول مدّكر ظاهرة
    await expect(page.locator("[data-testid='add-student-muddakir-fields']")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[data-testid='add-student-muddakir-track']")).toBeVisible();
    await page.locator("[data-testid='add-student-muddakir-track']").selectOption("3");

    await page.locator("[data-testid='add-student-submit']").click();
    await expect(page.locator("[data-testid='add-student-form']")).not.toBeVisible({ timeout: 6000 });
    await expect(page.getByText("إعداد ناقص")).not.toBeVisible();
  });
});
