import { test, expect, type Page } from "@playwright/test";

// ═══════════════════════════════════════════════════════════════
// بيانات وهميّة
// ═══════════════════════════════════════════════════════════════
const FAKE_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  refresh_token: "mock-refresh",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-1", email: "test@example.com", role: "authenticated" },
});

const ITEM_HIFZ = { id: "item-hifz", nameAr: "حفظ يوم", value: 10, grantSource: "ADMIN", requiresPresent: false };
const ITEM_UNIFORM = { id: "item-uniform", nameAr: "الزي", value: 5, grantSource: "ADMIN", requiresPresent: true };

const MOCK_STUDENT_PRESENT = {
  studentId: "s1",
  name: "أحمد الأوّل",
  program: "MARAQI",
  attendanceStatus: "PRESENT",
  todayHifzDone: false,
  tarseekhDone: null,
  stageLabel: "الثالث",
  hizb: 5,
  weeklyPercent: 70,
  weeklyComplete: false,
  deferredToday: false,
  mustRepeat: false,
  started: true,
  yesterday: null,
  required: null,
  noTrack: false,
  points: 50,
};

const MOCK_STUDENT_ABSENT = {
  ...MOCK_STUDENT_PRESENT,
  studentId: "s2",
  name: "بكر الثاني",
  attendanceStatus: "ABSENT_UNEXCUSED",
  points: 0,
};

const MOCK_PANEL = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "NEW", bound: { fromSurah: 78, fromAyah: 11, toSurah: 78, toAyah: 20 } },
    tarseekh: [],
    murajaah: null,
    hasTarsikh: false,
    hasMuraja: false,
  },
  qaidah: null,
  manualGranted: [],
};

// ═══════════════════════════════════════════════════════════════
// إعداد مشترَك
// ═══════════════════════════════════════════════════════════════
async function setupPage(page: Page, students = [MOCK_STUDENT_PRESENT, MOCK_STUDENT_ABSENT]) {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "مدير الحلقة", roles: ["CIRCLE_MANAGER"] } }),
  );
  await page.route("**/api/attendance/circles", (r) =>
    r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
  );
  await page.route("**/api/economy/grant", (r) =>
    r.fulfill({ json: { items: [ITEM_HIFZ, ITEM_UNIFORM] } }),
  );
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students, absentDefault: false } }),
  );
  await page.route("**/api/students/**/unified-panel**", (r) =>
    r.fulfill({ json: MOCK_PANEL }),
  );
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══════════════════════════════════════════════════════════════
// 6-ب: أزرار منح النقاط — 3 حالات + الزي للحاضرين
// ═══════════════════════════════════════════════════════════════
test.describe("6-ب: أزرار منح النقاط", () => {

  test("زرّ «الزي» يظهر للحاضر ولا يظهر للغائب", async ({ page }) => {
    await setupPage(page);

    // mock المنح لكلا الطالبين
    await page.route("**/api/students/**/grant-manual", (r) =>
      r.fulfill({ json: { granted: true } }),
    );

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(2, { timeout: 10_000 });

    // افتح بطاقة الحاضر (s1)
    await page.locator("[data-student-id='s1']").click();
    // يجب أن يظهر زرّ الزي للحاضر
    await expect(page.locator("[data-testid='grant-btn-item-uniform']")).toBeVisible({ timeout: 5_000 });

    // افتح بطاقة الغائب (s2)
    await page.locator("[data-student-id='s2']").click();
    // يجب أن يختفي زرّ الزي للغائب
    await expect(page.locator("[data-testid='grant-btn-item-uniform']")).toHaveCount(0, { timeout: 3_000 });

    // زرّ حفظ اليوم يظهر لكليهما
    await expect(page.locator("[data-testid='grant-btn-item-hifz']")).toBeVisible({ timeout: 3_000 });
  });

  test("الزرّ يمرّ بثلاث حالات: default → loading → saved", async ({ page }) => {
    let grantResolve: (() => void) | null = null;
    await setupPage(page, [MOCK_STUDENT_PRESENT]);

    // mock المنح بتأخير متحكَّم
    await page.route("**/api/students/s1/grant-manual", async (r) => {
      await new Promise<void>((res) => { grantResolve = res; });
      await r.fulfill({ json: { granted: true } });
    });

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });
    await page.locator("[data-testid='student-row']").first().click();

    const btn = page.locator("[data-testid='grant-btn-item-hifz']");
    await expect(btn).toBeVisible({ timeout: 5_000 });

    // الحالة 1: default — الزرّ ليس ممنوحاً
    await expect(btn).not.toHaveAttribute("data-granted");

    // انقر — الحالة 2: loading
    await btn.click();
    await expect(btn).toHaveAttribute("data-loading", "true", { timeout: 3_000 });
    await expect(btn).toContainText("جارٍ");

    // أكمل الطلب — الحالة 3: saved
    grantResolve?.();
    await expect(btn).toHaveAttribute("data-granted", "true", { timeout: 5_000 });
    await expect(btn).toContainText("✓");
    await expect(btn).not.toHaveAttribute("data-loading");
  });

  test("لا يُمكن منح بندٍ آخر أثناء جريان منح", async ({ page }) => {
    let grantResolve: (() => void) | null = null;
    // طالبٌ حاضر مع بند حفظ وبند زي
    await setupPage(page, [MOCK_STUDENT_PRESENT]);

    await page.route("**/api/students/s1/grant-manual", async (r) => {
      await new Promise<void>((res) => { grantResolve = res; });
      await r.fulfill({ json: { granted: true } });
    });

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });
    await page.locator("[data-testid='student-row']").first().click();

    await page.locator("[data-testid='grant-btn-item-hifz']").click();
    // أثناء الجريان: زرّ الزي معطَّل
    await expect(page.locator("[data-testid='grant-btn-item-uniform']")).toBeDisabled({ timeout: 3_000 });

    grantResolve?.();
    // بعد الانتهاء: زرّ الزي مفعَّل
    await expect(page.locator("[data-testid='grant-btn-item-uniform']")).toBeEnabled({ timeout: 5_000 });
  });

  test("تراجع (undo): زرّ ممنوح يُلغى بالنقر مرّةً أخرى", async ({ page }) => {
    // بدء الحالة بـmanualGranted مكتوب
    const panelWithGrant = { ...MOCK_PANEL, manualGranted: ["item-hifz"] };
    await setupPage(page, [MOCK_STUDENT_PRESENT]);

    await page.route("**/api/students/s1/unified-panel**", (r) =>
      r.fulfill({ json: panelWithGrant }),
    );
    await page.route("**/api/students/s1/grant-manual", (r) =>
      r.fulfill({ json: { granted: false } }), // revoke
    );

    await page.goto("/admin/unified");
    await page.locator("[data-testid='student-row']").first().click();

    const btn = page.locator("[data-testid='grant-btn-item-hifz']");
    await expect(btn).toHaveAttribute("data-granted", "true", { timeout: 5_000 });

    // انقر للتراجع
    await btn.click();
    await expect(btn).not.toHaveAttribute("data-granted", { timeout: 5_000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 6-ج: تفصيل نقاط اليوم
// ═══════════════════════════════════════════════════════════════
test.describe("6-ج: تفصيل نقاط اليوم", () => {

  test("يظهر الرصيد الإجمالي بجانب الاسم", async ({ page }) => {
    await setupPage(page, [MOCK_STUDENT_PRESENT]);
    await page.route("**/api/students/**/grant-manual", (r) =>
      r.fulfill({ json: { granted: true } }),
    );

    await page.goto("/admin/unified");
    await page.locator("[data-testid='student-row']").first().click();

    // s1 لديه points=50 — يظهر بجانب الاسم
    await expect(page.locator("strong:has-text('أحمد الأوّل') ~ span, strong:has-text('أحمد الأوّل') + span")).toBeVisible({ timeout: 5_000 });
  });

  test("تفصيل نقاط اليوم يظهر بعد المنح", async ({ page }) => {
    await setupPage(page, [MOCK_STUDENT_PRESENT]);
    await page.route("**/api/students/s1/grant-manual", (r) =>
      r.fulfill({ json: { granted: true } }),
    );

    await page.goto("/admin/unified");
    await page.locator("[data-testid='student-row']").first().click();

    // قبل المنح: لا تفصيل
    await expect(page.locator("[data-testid='today-earned-detail']")).toHaveCount(0, { timeout: 3_000 });

    // انقر منح
    await page.locator("[data-testid='grant-btn-item-hifz']").click();
    await expect(page.locator("[data-testid='grant-btn-item-hifz']")).toHaveAttribute("data-granted", "true", { timeout: 5_000 });

    // بعد المنح: يظهر التفصيل
    const detail = page.locator("[data-testid='today-earned-detail']");
    await expect(detail).toBeVisible({ timeout: 3_000 });
    await expect(detail).toContainText("حفظ يوم");
    await expect(detail).toContainText("١٠"); // arNum(10) = ١٠
  });

  test("مجموع نقاط اليوم يظهر في رأس القسم بعد المنح", async ({ page }) => {
    await setupPage(page, [MOCK_STUDENT_PRESENT]);
    await page.route("**/api/students/s1/grant-manual", (r) =>
      r.fulfill({ json: { granted: true } }),
    );

    await page.goto("/admin/unified");
    await page.locator("[data-testid='student-row']").first().click();
    await page.locator("[data-testid='grant-btn-item-hifz']").click();
    await expect(page.locator("[data-testid='grant-btn-item-hifz']")).toHaveAttribute("data-granted", "true", { timeout: 5_000 });

    // العنوان يحتوي +١٠
    await expect(page.locator("h3:has-text('نقاط اليوم')")).toContainText("١٠", { timeout: 3_000 });
  });
});
