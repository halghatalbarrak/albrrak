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

const MOCK_STUDENTS = [
  {
    studentId: "s1",
    name: "أحمد الأوّل",
    program: "MARAQI",
    attendanceStatus: null,
    todayHifzDone: false,
    tarseekhDone: null,
    stageLabel: "الثالث",
    hizb: 5,
    weeklyPercent: 70,
    weeklyComplete: false,
    deferredToday: false,
    mustRepeat: false,
    started: true,
    yesterday: { fromSurah: 78, fromAyah: 1, toSurah: 78, toAyah: 10, mastered: false },
    required: null,
  },
  {
    studentId: "s2",
    name: "محمد الثاني",
    program: "MARAQI",
    attendanceStatus: null,
    todayHifzDone: false,
    tarseekhDone: null,
    stageLabel: "الرابع",
    hizb: 10,
    weeklyPercent: 50,
    weeklyComplete: false,
    deferredToday: false,
    mustRepeat: false,
    started: true,
    yesterday: { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 4, mastered: false },
    required: null,
  },
  {
    studentId: "s3",
    name: "عليّ الثالث",
    program: "MARAQI",
    attendanceStatus: null,
    todayHifzDone: false,
    tarseekhDone: null,
    stageLabel: "الخامس",
    hizb: 15,
    weeklyPercent: 90,
    weeklyComplete: false,
    deferredToday: false,
    mustRepeat: false,
    started: true,
    yesterday: { fromSurah: 113, fromAyah: 1, toSurah: 113, toAyah: 5, mastered: false },
    required: null,
  },
];

const MOCK_PANEL = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "NEW", bound: { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 1 } },
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
async function setupPage(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);

  // دور CIRCLE_MANAGER — يرى زرّ التصحيح الجماعي
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "مدير الحلقة", roles: ["CIRCLE_MANAGER"] } }),
  );
  await page.route("**/api/attendance/circles", (r) =>
    r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
  );
  await page.route("**/api/economy/grant", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: MOCK_STUDENTS, absentDefault: false } }),
  );
  await page.route("**/api/students/**/unified-panel**", (r) =>
    r.fulfill({ json: MOCK_PANEL }),
  );
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══════════════════════════════════════════════════════════════
// الاختبارات
// ═══════════════════════════════════════════════════════════════
test.describe("تصحيح مواضع ٣ طلاب دفعة واحدة", () => {

  test("تصحيح مواضع ٣ طلاب دفعة واحدة — كل منهم يرى مقرّر اليوم من موضعه الجديد", async ({ page }) => {
    const bulkReqs: Record<string, unknown>[] = [];

    await setupPage(page);

    // تزوير API التصحيح الجماعي
    await page.route("**/api/circles/c1/bulk-correct-positions", async (r) => {
      const body = await r.request().postDataJSON() as Record<string, unknown>;
      bulkReqs.push(body);
      await r.fulfill({
        json: { corrected: 3, errors: [] },
      });
    });

    await page.goto("/admin/unified");

    // انتظر ظهور قائمة الطلاب الثلاثة
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(3, { timeout: 10_000 });

    // يجب أن يظهر زرّ «تصحيح الموضع الجماعي» للـCIRCLE_MANAGER
    const bulkBtn = page.locator("[data-testid='bulk-correct-positions-btn']");
    await expect(bulkBtn).toBeVisible({ timeout: 5_000 });

    // افتح الـdialog
    await bulkBtn.click();
    const dialog = page.locator("[data-testid='bulk-correct-dialog']");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // يجب أن يظهر جدول بثلاثة طلاب — تحقّق من الصف الأول
    await expect(dialog.getByText("أحمد الأوّل")).toBeVisible();
    await expect(dialog.getByText("محمد الثاني")).toBeVisible();
    await expect(dialog.getByText("عليّ الثالث")).toBeVisible();

    // اختر السبب
    await dialog.locator("select").first().selectOption("INPUT_ERROR");

    // اضغط «حفظ الجميع»
    await dialog.locator("[data-testid='bulk-correct-save-btn']").click();

    // انتظر إرسال الطلب
    await expect.poll(() => bulkReqs.length, { timeout: 6_000 }).toBeGreaterThan(0);

    // تحقّق من بنية الطلب
    const sent = bulkReqs[0] as {
      corrections: { studentId: string }[];
      reason: string;
    };
    expect(sent.reason).toBe("INPUT_ERROR");
    expect(Array.isArray(sent.corrections)).toBe(true);
    expect(sent.corrections).toHaveLength(3);

    const sentIds = sent.corrections.map((c) => c.studentId);
    expect(sentIds).toContain("s1");
    expect(sentIds).toContain("s2");
    expect(sentIds).toContain("s3");

    // تحقّق من إغلاق الـdialog بعد النجاح
    await expect(dialog).not.toBeVisible({ timeout: 4_000 });
  });

  test("زرّ التصحيح الجماعي لا يظهر للمعلّم (TEACHER فقط)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.addInitScript((session) => {
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
        return orig.call(this, key);
      };
    }, FAKE_SESSION);

    // دور TEACHER فقط — لا يرى الزرّ
    await page.route("**/api/me", (r) =>
      r.fulfill({ json: { name: "معلّم", roles: ["TEACHER"] } }),
    );
    await page.route("**/api/attendance/circles", (r) =>
      r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
    );
    await page.route("**/api/economy/grant", (r) =>
      r.fulfill({ json: { items: [] } }),
    );
    await page.route("**/api/circles/c1/unified**", (r) =>
      r.fulfill({ json: { students: MOCK_STUDENTS, absentDefault: false } }),
    );
    await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(3, { timeout: 10_000 });

    // الزرّ غير موجود للمعلّم
    await expect(page.locator("[data-testid='bulk-correct-positions-btn']")).not.toBeVisible();
  });

  test("dialog يرفض الحفظ بلا سبب ويعرض رسالة خطأ", async ({ page }) => {
    await setupPage(page);
    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(3, { timeout: 10_000 });

    await page.locator("[data-testid='bulk-correct-positions-btn']").click();
    const dialog = page.locator("[data-testid='bulk-correct-dialog']");
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // اضغط حفظ بلا اختيار سبب
    await dialog.locator("[data-testid='bulk-correct-save-btn']").click();

    // تحقّق من رسالة الخطأ
    await expect(dialog.getByText("الرجاء اختيار السبب")).toBeVisible({ timeout: 3_000 });
  });
});
