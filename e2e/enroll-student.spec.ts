/**
 * E2E — نموذج «تسجيل طالب جديد»
 * الحالة ١: معلّم يسجّل طالبًا مراقي (يجتاز) → لا شارة «إعداد ناقص».
 * الحالة ٢: معلّم يسجّل طالبًا مدّكِرًا → لا شارة «إعداد ناقص».
 */
import { test, expect } from "@playwright/test";

const FAKE_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-1", email: "t@t.com", role: "authenticated" },
});

const ENROLL_DATA = {
  programs: [
    { id: "prog-maraqi", key: "MARAQI", nameAr: "مراقي" },
    { id: "prog-muddakir", key: "MUDDAKIR", nameAr: "المدّكِر" },
  ],
  tracks: [
    { id: "track-1", nameAr: "مسار أوّل", linesPerDay: 4, ordinal: 1 },
    { id: "track-2", nameAr: "مسار ثانٍ", linesPerDay: 6, ordinal: 2 },
  ],
  supervisors: [
    { id: "sup-1", nameAr: "أحمد المشرف", currentLoad: 2 },
  ],
  circleNameAr: "حلقة النور",
};

const CIRCLE_DATA = {
  students: [
    {
      studentId: "s-new-1",
      userId: "u-new-1",
      name: "عبدالله العمر",
      attendanceStatus: null,
      todayHifzDone: false,
      program: "MARAQI",
      setupStatus: { isComplete: true, blockers: [], warnings: [] },
    },
  ],
  absentDefault: false,
  dayLock: null,
};

const CIRCLE_DATA_MUDDAKIR = {
  students: [
    {
      studentId: "s-new-2",
      userId: "u-new-2",
      name: "فهد الحافظ",
      attendanceStatus: null,
      todayHifzDone: false,
      program: "MUDDAKIR",
      setupStatus: { isComplete: true, blockers: [], warnings: [] },
    },
  ],
  absentDefault: false,
  dayLock: null,
};

async function setupPage(page: import("@playwright/test").Page) {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**/api/me", (r) => r.fulfill({ json: { name: "م. أحمد", roles: ["TEACHER"] } }));
  await page.route("**/api/attendance/circles**", (r) =>
    r.fulfill({ json: { circles: [{ id: "circle-1", nameAr: "حلقة النور" }] } }),
  );
  await page.route("**/api/economy/grant**", (r) => r.fulfill({ json: { items: [] } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══ ١) تسجيل طالب مراقي — يجتاز → لا شارة إعداد ناقص ═══
test("تسجيل طالب مراقي مجتاز لا يُنتج شارة «إعداد ناقص»", async ({ page }) => {
  await setupPage(page);

  // البيانات المرجعيّة وقائمة الطلاب الأولى (فارغة)
  await page.route("**/api/students/enroll-data**", (r) => r.fulfill({ json: ENROLL_DATA }));
  await page.route("**/api/circles/circle-1/unified**", (r) =>
    r.fulfill({ json: { students: [], absentDefault: false, dayLock: null } }),
  );

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='add-student-btn']")).toBeVisible({ timeout: 15_000 });
  await page.click("[data-testid='add-student-btn']");
  await expect(page.locator("[data-testid='enroll-student-form']")).toBeVisible();

  // ملء النموذج
  await page.fill("[data-testid='enroll-name']", "عبدالله خالد العمر التميمي");
  await page.fill("[data-testid='enroll-birth-year']", "2010");
  await page.locator("[data-testid='enroll-birth-month']").selectOption("5");
  await page.locator("[data-testid='enroll-birth-day']").selectOption("15");
  await page.fill("[data-testid='enroll-guardian-phone']", "0501234567");
  await page.locator("[data-testid='enroll-program']").selectOption("prog-maraqi");
  await page.locator("[data-testid='enroll-start-surah']").selectOption("1");
  await page.locator("[data-testid='enroll-start-ayah']").selectOption("1");
  await page.locator("[data-testid='enroll-track']").selectOption("track-1");
  await page.click("[data-testid='enroll-test-passed']");

  // تثبيت نتيجة الحفظ
  await page.route("**/api/students/enroll", (r) =>
    r.fulfill({
      status: 201,
      json: { studentId: "s-new-1", userId: "u-new-1", duplicate: false, setupComplete: true },
    }),
  );
  // بعد الحفظ: تحديث قائمة الطلاب بالطالب الجديد
  await page.route("**/api/circles/circle-1/unified**", (r) =>
    r.fulfill({ json: CIRCLE_DATA }),
  );

  await page.click("[data-testid='enroll-submit']");

  // يجب أن تظهر رسالة «جاهز للتسميع»
  await expect(page.getByText("الطالب جاهز للتسميع")).toBeVisible({ timeout: 10_000 });

  // الطالب في القائمة
  const row = page.locator("[data-testid='student-row']").filter({ hasText: "عبدالله العمر" });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // لا شارة «إعداد ناقص»
  const badgeSetup = row.locator("text=إعداد ناقص");
  await expect(badgeSetup).not.toBeVisible();
});

// ═══ ٢) تسجيل طالب مدّكِر — لا شارة إعداد ناقص ═══
test("تسجيل طالب مدّكِر لا يُنتج شارة «إعداد ناقص»", async ({ page }) => {
  await setupPage(page);

  await page.route("**/api/students/enroll-data**", (r) => r.fulfill({ json: ENROLL_DATA }));
  await page.route("**/api/circles/circle-1/unified**", (r) =>
    r.fulfill({ json: { students: [], absentDefault: false, dayLock: null } }),
  );

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='add-student-btn']")).toBeVisible({ timeout: 15_000 });
  await page.click("[data-testid='add-student-btn']");
  await expect(page.locator("[data-testid='enroll-student-form']")).toBeVisible();

  await page.fill("[data-testid='enroll-name']", "فهد إبراهيم الغامدي الحربي");
  await page.fill("[data-testid='enroll-birth-year']", "2000");
  await page.locator("[data-testid='enroll-birth-month']").selectOption("3");
  await page.locator("[data-testid='enroll-birth-day']").selectOption("10");
  await page.fill("[data-testid='enroll-guardian-phone']", "0509876543");
  await page.locator("[data-testid='enroll-program']").selectOption("prog-muddakir");
  await page.locator("[data-testid='enroll-muddakir-track']").selectOption("2");
  await page.locator("[data-testid='enroll-supervisor']").selectOption("sup-1");

  await page.route("**/api/students/enroll", (r) =>
    r.fulfill({
      status: 201,
      json: { studentId: "s-new-2", userId: "u-new-2", duplicate: false, setupComplete: true },
    }),
  );
  await page.route("**/api/circles/circle-1/unified**", (r) =>
    r.fulfill({ json: CIRCLE_DATA_MUDDAKIR }),
  );

  await page.click("[data-testid='enroll-submit']");

  await expect(page.getByText("الطالب جاهز للتسميع")).toBeVisible({ timeout: 10_000 });

  const row = page.locator("[data-testid='student-row']").filter({ hasText: "فهد الحافظ" });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator("text=إعداد ناقص")).not.toBeVisible();
});
