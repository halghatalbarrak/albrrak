import { test, expect } from "@playwright/test";

// بيانات وهمية: عشرة طلاب لاختبار الأكورديون
const MOCK_STUDENTS = Array.from({ length: 10 }, (_, i) => ({
  studentId: `student-${i + 1}`,
  name: `الطالب ${i + 1}`,
  program: "MARAQI",
  attendanceStatus: null,
  todayHifzDone: false,
  tarseekhDone: null,
  stageLabel: "السادس",
  hizb: null,
  weeklyPercent: null,
  weeklyComplete: false,
  deferredToday: false,
  mustRepeat: false,
  started: true,
  yesterday: null,
  required: null,
}));

const MOCK_PANEL = {
  today: {
    status: "ACTIVE",
    newHifz: null,
    tarseekh: [],
    murajaah: null,
    hasTarsikh: false,
    hasMuraja: false,
  },
  qaidah: null,
};

// تزوير جلسة Supabase عبر localStorage قبل تحميل الصفحة
const FAKE_SESSION = JSON.stringify({
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  refresh_token: "mock-refresh",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-1", email: "test@example.com", role: "authenticated" },
});

test.describe("الشاشة الموحّدة — أكورديون بعرض 390px", () => {
  test.beforeEach(async ({ page }) => {
    // حقن الجلسة الوهمية في localStorage لأي مفتاح Supabase
    await page.addInitScript((session) => {
      const origGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
        return origGetItem.call(this, key);
      };
    }, FAKE_SESSION);

    // تزوير استجابات API
    await page.route("**/api/me", (route) =>
      route.fulfill({ json: { name: "معلّم تجريبي", roles: ["TEACHER"] } }),
    );
    await page.route("**/api/attendance/circles", (route) =>
      route.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
    );
    await page.route("**/api/economy/grant", (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    await page.route("**/api/circles/c1/unified**", (route) =>
      route.fulfill({ json: { students: MOCK_STUDENTS, absentDefault: false } }),
    );
    // استجابة تفاصيل البطاقة per-student
    await page.route("**/api/students/**/unified-panel**", (route) =>
      route.fulfill({ json: MOCK_PANEL }),
    );
    // تجاهل أي طلبات Supabase أخرى
    await page.route("**supabase**", (route) => route.fulfill({ json: {} }));
  });

  test("الضغط على الطالب السادس يُظهر بطاقته مباشرة تحت اسمه لا بعد آخر طالب", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/unified");

    // انتظر ظهور قائمة الطلاب
    const rows = page.locator("[data-testid='student-row']");
    await expect(rows).toHaveCount(10, { timeout: 10_000 });

    // انقر على الطالب السادس (الفهرس 5)
    await rows.nth(5).locator("button").first().click();

    // تأكّد أن البطاقة المضمَّنة ظهرت
    const inlineCard = page.locator("[data-testid='student-inline-card']");
    await expect(inlineCard).toBeVisible({ timeout: 5_000 });

    // البطاقة يجب أن تظهر داخل صفّ الطالب السادس (data-testid=student-row)، لا بعده
    const sixthRow = rows.nth(5);
    const sixthRowBox = await sixthRow.boundingBox();
    const cardBox = await inlineCard.boundingBox();
    const seventhRow = rows.nth(6);
    const seventhRowBox = await seventhRow.boundingBox();

    // البطاقة تبدأ بعد زرّ الاسم (أسفل من رأس الصفّ)
    expect(cardBox!.y).toBeGreaterThan(sixthRowBox!.y);

    // الطالب السابع يبدأ بعد البطاقة (أي البطاقة ليست في آخر الصفحة)
    expect(seventhRowBox!.y).toBeGreaterThan(cardBox!.y + cardBox!.height - 60);

    // البطاقة تبدأ قبل الطالب السابع (وليس في نهاية القائمة)
    expect(cardBox!.y).toBeLessThan(seventhRowBox!.y);
  });
});
