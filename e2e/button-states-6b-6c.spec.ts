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

const ITEM_HIFZ    = { id: "item-hifz",    nameAr: "حفظ يوم", value: 10, grantSource: "ADMIN", requiresPresent: false };
const ITEM_UNIFORM = { id: "item-uniform", nameAr: "الزي",    value: 5,  grantSource: "ADMIN", requiresPresent: true  };

function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    studentId: "s1", name: "أحمد الأوّل", program: "MARAQI",
    attendanceStatus: null, todayHifzDone: false, tarseekhDone: null,
    stageLabel: "الثالث", hizb: 5, weeklyPercent: 70, weeklyComplete: false,
    deferredToday: false, mustRepeat: false, started: true,
    yesterday: null, required: null, noTrack: false, points: 50,
    ...overrides,
  };
}

const PANEL_WITH_TARSEEKH_MURAJAAH = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "NEW", bound: { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 1 } },
    tarseekh: [{ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, savedErrors: 0, sessionId: "sess-1" }],
    murajaah: { dayNo: 1, totalStock: 1, todaySlice: [{ fromSurah: 113, fromAyah: 1, toSurah: 113, toAyah: 5 }] },
    hasTarsikh: true, hasMuraja: true,
  },
  qaidah: null, manualGranted: [],
};

const PANEL_NO_TARSEEKH = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "NEW", bound: { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 1 } },
    tarseekh: [], murajaah: null, hasTarsikh: false, hasMuraja: false,
  },
  qaidah: null, manualGranted: [],
};

async function setupBase(page: Page, students: unknown[], panel = PANEL_WITH_TARSEEKH_MURAJAAH) {
  await page.setViewportSize({ width: 390, height: 844 });

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
    r.fulfill({ json: panel }),
  );
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

async function openFirstCard(page: Page) {
  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });
  await page.locator("[data-testid='student-row']").first().locator("button").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 6_000 });
  await expect(page.locator("[data-testid='hifz-btn-mastered']")).toBeVisible({ timeout: 6_000 });
}

// ═══════════════════════════════════════════════════════════════
// ١. أزرار الحضور — محايدة ثم خضراء
// ═══════════════════════════════════════════════════════════════
test.describe("حالات أزرار الحضور", () => {

  test("أزرار الحضور محايدة افتراضياً (بلا data-active)", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/circles/c1/mark-attendance", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    // لا يجب أن يكون أيّ زرّ حضور نشطاً بادئ الأمر
    await expect(page.locator("[data-testid='att-btn-PRESENT'][data-active='true']")).toHaveCount(0);
    await expect(page.locator("[data-testid='att-btn-LATE'][data-active='true']")).toHaveCount(0);
    await expect(page.locator("[data-testid='att-btn-ABSENT_UNEXCUSED'][data-active='true']")).toHaveCount(0);
  });

  test("بعد نجاح الخادم: الزرّ المضغوط وحده يصبح data-active='true'", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/circles/c1/mark-attendance", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    await page.locator("[data-testid='att-btn-PRESENT']").click();
    await expect(page.locator("[data-testid='att-btn-PRESENT'][data-active='true']")).toBeVisible({ timeout: 5_000 });

    // الأزرار الأخرى لا تزال محايدة
    await expect(page.locator("[data-testid='att-btn-LATE'][data-active='true']")).toHaveCount(0);
    await expect(page.locator("[data-testid='att-btn-ABSENT_UNEXCUSED'][data-active='true']")).toHaveCount(0);
  });

  test("تغيير الاختيار ينقل data-active إلى الزرّ الجديد", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/circles/c1/mark-attendance", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    await page.locator("[data-testid='att-btn-PRESENT']").click();
    await expect(page.locator("[data-testid='att-btn-PRESENT'][data-active='true']")).toBeVisible({ timeout: 5_000 });

    await page.locator("[data-testid='att-btn-LATE']").click();
    await expect(page.locator("[data-testid='att-btn-LATE'][data-active='true']")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-testid='att-btn-PRESENT'][data-active='true']")).toHaveCount(0);
  });

  test("يستعيد حالة الحضور المحفوظة بعد التحديث (يقرؤها من بيانات الخادم)", async ({ page }) => {
    // الطالب محفوظ حضوره مسبقاً كـ LATE
    await setupBase(page, [makeStudent({ attendanceStatus: "LATE" })]);
    await openFirstCard(page);

    // يجب أن يظهر زرّ LATE نشطاً مباشرةً بدون ضغط
    await expect(page.locator("[data-testid='att-btn-LATE'][data-active='true']")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-testid='att-btn-PRESENT'][data-active='true']")).toHaveCount(0);
  });

});

// ═══════════════════════════════════════════════════════════════
// ٢. أزرار المحاولات (١/٢/٣) + أتقن/لم يتقن
// ═══════════════════════════════════════════════════════════════
test.describe("حالات أزرار الحفظ (المحاولات وأتقن/لم يتقن)", () => {

  test("أزرار أتقن/لم يتقن محايدة افتراضياً (بلا data-saved)", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await openFirstCard(page);

    await expect(page.locator("[data-testid='hifz-btn-mastered'][data-saved='true']")).toHaveCount(0);
    await expect(page.locator("[data-testid='hifz-btn-not-mastered'][data-saved='true']")).toHaveCount(0);
  });

  test("«أتقن» يصبح data-saved='true' بعد نجاح الخادم", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/students/s1/session", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    await page.locator("[data-testid='hifz-btn-mastered']").click();
    await expect(page.locator("[data-testid='hifz-btn-mastered'][data-saved='true']")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-testid='hifz-btn-not-mastered'][data-saved='true']")).toHaveCount(0);
  });

  test("«لم يتقن» يصبح data-saved='true' بعد نجاح الخادم", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/students/s1/session", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    await page.locator("[data-testid='hifz-btn-not-mastered']").click();
    await expect(page.locator("[data-testid='hifz-btn-not-mastered'][data-saved='true']")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("[data-testid='hifz-btn-mastered'][data-saved='true']")).toHaveCount(0);
  });

});

// ═══════════════════════════════════════════════════════════════
// ٣. أزرار رسّخ (تمّ / لم يتمّ)
// ═══════════════════════════════════════════════════════════════
test.describe("حالات أزرار رسّخ", () => {

  test("زرّا رسّخ محايدان افتراضياً (بلا data-saved)", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await openFirstCard(page);

    // لا يجب أن يكون أيّ زرّ رسّخ محفوظاً في البداية
    await expect(page.locator("[data-testid='consol-btn-done'][data-saved='true']")).toHaveCount(0);
    await expect(page.locator("[data-testid='consol-btn-not-done'][data-saved='true']")).toHaveCount(0);
  });

  test("«رسّخ تمّ» يصبح data-saved='true' بعد نجاح الخادم", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/students/s1/session", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    await page.locator("[data-testid='consol-btn-done']").first().click();
    await expect(
      page.locator("[data-testid='consol-btn-done'][data-saved='true']").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("يستعيد حالة رسّخ المحفوظة من بيانات الخادم", async ({ page }) => {
    await setupBase(page, [makeStudent({ tarseekhDone: true })]);
    await openFirstCard(page);

    // يجب أن يظهر زرّ «تمّ» محفوظاً بلا ضغط
    await expect(
      page.locator("[data-testid='consol-btn-done'][data-saved='true']").first()
    ).toBeVisible({ timeout: 5_000 });
  });

});

// ═══════════════════════════════════════════════════════════════
// ٤. أزرار راجِع (تمّ / لم يتمّ)
// ═══════════════════════════════════════════════════════════════
test.describe("حالات أزرار راجِع", () => {

  test("زرّا راجِع محايدان افتراضياً (بلا data-saved)", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await openFirstCard(page);

    await expect(page.locator("[data-testid='consol-btn-done']").nth(1).getAttribute("data-saved")).resolves.toBeNull();
  });

  test("«راجِع تمّ» يصبح data-saved='true' بعد نجاح الخادم", async ({ page }) => {
    await setupBase(page, [makeStudent()]);
    await page.route("**/api/students/s1/session", (r) => r.fulfill({ json: { ok: true } }));
    await openFirstCard(page);

    // الـ ConsolidationRow الثاني هو قسم راجِع
    await page.locator("[data-testid='consol-btn-done']").nth(1).click();
    await expect(
      page.locator("[data-testid='consol-btn-done']").nth(1)
    ).toHaveAttribute("data-saved", "true", { timeout: 5_000 });
  });

});

// ═══════════════════════════════════════════════════════════════
// ٥. «الزي للحاضرين» — الإجراء الجماعي
// ═══════════════════════════════════════════════════════════════
test.describe("الزي للحاضرين — الإجراء الجماعي", () => {

  test("زرّ «منح الزي للحاضرين» يظهر عند وجود حاضرين وبند requiresPresent", async ({ page }) => {
    await setupBase(page, [makeStudent({ attendanceStatus: "PRESENT" })]);
    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });

    await expect(page.locator("[data-testid='grant-uniform-btn']")).toBeVisible({ timeout: 5_000 });
  });

  test("زرّ «منح الزي للحاضرين» لا يظهر إن لم يكن أحد حاضراً", async ({ page }) => {
    await setupBase(page, [makeStudent({ attendanceStatus: null })]);
    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });

    await expect(page.locator("[data-testid='grant-uniform-btn']")).toHaveCount(0);
  });

  test("«منح الزي للحاضرين» يستدعي grant-bulk بمعرّف بند الزي وقائمة الحاضرين", async ({ page }) => {
    const bulkReqs: { studentIds: string[]; pointItemId: string }[] = [];

    await setupBase(page, [
      makeStudent({ studentId: "s1", attendanceStatus: "PRESENT" }),
      makeStudent({ studentId: "s2", attendanceStatus: "LATE", name: "بكر" }),
      makeStudent({ studentId: "s3", attendanceStatus: "ABSENT_UNEXCUSED", name: "خالد" }),
    ]);
    await page.route("**/api/economy/grant-bulk", async (r) => {
      bulkReqs.push(await r.request().postDataJSON() as { studentIds: string[]; pointItemId: string });
      await r.fulfill({ json: { granted: 2 } });
    });

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(3, { timeout: 10_000 });

    await page.locator("[data-testid='grant-uniform-btn']").click();

    await expect.poll(() => bulkReqs.length, { timeout: 6_000 }).toBeGreaterThan(0);

    // يجب أن يُرسَل فقط لبند الزي (requiresPresent=true)
    const uniformCall = bulkReqs.find((r) => r.pointItemId === "item-uniform");
    expect(uniformCall).toBeDefined();

    // يشمل s1 (PRESENT) و s2 (LATE) — يستثني s3 (ABSENT)
    expect(uniformCall?.studentIds).toContain("s1");
    expect(uniformCall?.studentIds).toContain("s2");
    expect(uniformCall?.studentIds).not.toContain("s3");
  });

  test("«منح الزي للحاضرين» لا يستدعي grant-bulk لبند لا يتطلّب حضوراً", async ({ page }) => {
    const bulkReqs: { pointItemId: string }[] = [];

    await setupBase(page, [makeStudent({ attendanceStatus: "PRESENT" })]);
    await page.route("**/api/economy/grant-bulk", async (r) => {
      bulkReqs.push(await r.request().postDataJSON() as { pointItemId: string });
      await r.fulfill({ json: { granted: 1 } });
    });

    await page.goto("/admin/unified");
    await page.locator("[data-testid='grant-uniform-btn']").click();

    await expect.poll(() => bulkReqs.length, { timeout: 6_000 }).toBeGreaterThan(0);

    // يجب ألّا يُرسَل لبند حفظ اليوم (requiresPresent=false)
    const hifzCall = bulkReqs.find((r) => r.pointItemId === "item-hifz");
    expect(hifzCall).toBeUndefined();
  });

});
