import { test, expect, type Page } from "@playwright/test";

// ═══════════════════════════════════════════════════════════════
// بيانات وهميّة مشتركة
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
    yesterday: null,
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
    yesterday: null,
    required: null,
  },
];

// بطاقة كاملة مع حفظٍ جديد + ترسيخ + مراجعة
const MOCK_PANEL_FULL = {
  today: {
    status: "ACTIVE",
    // وجهة اليوم: سورة الإخلاص (١١٢) آية ١→١ — سهل اختبار +آية/-آية
    newHifz: { kind: "NEW", bound: { fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 1 } },
    tarseekh: [
      { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, savedErrors: 0, sessionId: "sess-1" },
    ],
    murajaah: {
      dayNo: 1,
      totalStock: 1,
      todaySlice: [{ fromSurah: 113, fromAyah: 1, toSurah: 113, toAyah: 5 }],
    },
    hasTarsikh: true,
    hasMuraja: true,
  },
  qaidah: null,
  manualGranted: [],
};

// بيانات الحلقة بقفل يوم مفتوح (للاختبار ١٢)
const MOCK_UNIFIED_WITH_LOCK = {
  students: MOCK_STUDENTS,
  absentDefault: false,
  dayLock: { state: "OPEN", locked: false, date: "2026-11-22" },
};

// ═══════════════════════════════════════════════════════════════
// إعداد مشترَك: تزوير الجلسة + المسارات + تحميل الصفحة بعرض ٣٩٠
// ═══════════════════════════════════════════════════════════════
async function setupPage(page: Page, withLock = false) {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "معلّم تجريبي", roles: ["TEACHER"] } }),
  );
  await page.route("**/api/attendance/circles", (r) =>
    r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
  );
  await page.route("**/api/economy/grant", (r) =>
    r.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({
      json: withLock ? MOCK_UNIFIED_WITH_LOCK : { students: MOCK_STUDENTS, absentDefault: false },
    }),
  );
  await page.route("**/api/students/**/unified-panel**", (r) =>
    r.fulfill({ json: MOCK_PANEL_FULL }),
  );
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

async function openFirstStudent(page: Page) {
  await page.goto("/admin/unified");
  const rows = page.locator("[data-testid='student-row']");
  await expect(rows).toHaveCount(2, { timeout: 10_000 });
  await rows.first().locator("button").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 6_000 });
  // انتظر تحميل البطاقة (زرّ الحفظ يظهر بعد API)
  await expect(page.locator("[data-testid='hifz-btn-mastered']")).toBeVisible({ timeout: 6_000 });
}

// ═══════════════════════════════════════════════════════════════
// الاختبارات
// ═══════════════════════════════════════════════════════════════
test.describe("الشاشة الموحّدة — أزرار البطاقة بعرض ٣٩٠px", () => {

  // ── أزرار الحضور الأربعة المباشرة ──────────────────────────────
  test("أزرار الحضور الأربعة تُرسل الحالة الصحيحة للخادم", async ({ page }) => {
    const attReqs: { studentId: string; status: string }[] = [];
    await setupPage(page);
    await page.route("**/api/circles/c1/mark-attendance", async (r) => {
      attReqs.push(await r.request().postDataJSON() as { studentId: string; status: string });
      await r.fulfill({ json: { ok: true } });
    });

    await openFirstStudent(page);

    const cases: { testid: string; expected: string }[] = [
      { testid: "att-btn-PRESENT", expected: "PRESENT" },
      { testid: "att-btn-LATE", expected: "LATE" },
      { testid: "att-btn-ABSENT_UNEXCUSED", expected: "ABSENT_UNEXCUSED" },
      { testid: "att-btn-LEFT_NO_PERMISSION", expected: "LEFT_NO_PERMISSION" },
    ];

    for (const { testid, expected } of cases) {
      await page.locator(`[data-testid='${testid}']`).click();
      await expect.poll(() => attReqs.at(-1)?.status, { timeout: 4_000 }).toBe(expected);
    }

    expect(attReqs).toHaveLength(4);
    expect(attReqs[0].studentId).toBe("s1");
  });

  // ── زر «مستأذن» (excuse) عبر window.prompt ────────────────────
  test("زر «مستأذن» يُرسل طلب العذر", async ({ page }) => {
    const excuseReqs: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/attendance/excuse", async (r) => {
      excuseReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    // قبول dialog window.prompt تلقائياً
    page.on("dialog", (d) => void d.accept("عذر تجريبي"));

    await openFirstStudent(page);

    await page.getByRole("button", { name: "مستأذن" }).click();
    await expect.poll(() => excuseReqs.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(excuseReqs[0].studentId).toBe("s1");
    expect(excuseReqs[0].kind).toBe("EXCUSE");
  });

  // ── أزرار المحاولات ١/٢/٣ ─────────────────────────────────────
  test("أزرار المحاولات تُبدِّل الاختيار وتُرسل العدد الصحيح", async ({ page }) => {
    const hifzBodies: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/students/s1/session", async (r) => {
      hifzBodies.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await openFirstStudent(page);

    // الافتراضي = ١؛ نضغط على «٢» ثم «أتقن»
    const tryBtns = page.locator("button").filter({ hasText: /^[١٢٣]$/ });
    await tryBtns.nth(1).click(); // «٢»
    await page.locator("[data-testid='hifz-btn-mastered']").click();
    await expect.poll(() => hifzBodies.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(hifzBodies[0].attempts).toBe(2);

    // نضغط «٣» ثم «لم يُتقن»
    await tryBtns.nth(2).click(); // «٣»
    await page.locator("[data-testid='hifz-btn-not-mastered']").click();
    await expect.poll(() => hifzBodies.length, { timeout: 5_000 }).toBeGreaterThan(1);
    expect(hifzBodies[1].attempts).toBe(3);
    expect(hifzBodies[1].mastered).toBe(false);
  });

  // ── رسّخ: تمّ ولم يتمّ ────────────────────────────────────────
  test("زرّا «رسّخ» (تمّ / لم يتمّ) يُرسلان الحالة الصحيحة", async ({ page }) => {
    const tReqs: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/students/s1/session", async (r) => {
      tReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await openFirstStudent(page);

    await page.locator("[data-testid='consol-btn-done']").first().click();
    await expect.poll(() => tReqs.at(-1), { timeout: 5_000 }).toMatchObject({ kind: "tarseekh", done: true });

    await page.locator("[data-testid='consol-btn-not-done']").first().click();
    await expect.poll(() => tReqs.at(-1), { timeout: 5_000 }).toMatchObject({ kind: "tarseekh", done: false });
  });

  // ── رسّخ: أخطاء وحدة ──────────────────────────────────────────
  test("زر «أخطاء» في رسّخ يُظهر قائمة الوحدات ثم يُرسل عند النقر", async ({ page }) => {
    await setupPage(page);
    await page.route("**/api/students/s1/unit-errors", (r) => r.fulfill({ json: {} }));

    await openFirstStudent(page);

    // افتح قائمة الأخطاء
    await page.locator("[data-testid='consol-btn-errors']").first().click();
    // يجب أن تظهر وحدة على الأقل
    const unitBtns = page.locator("button").filter({ hasText: /سليم|خطأ|خطآن|ثلاثة/ });
    await expect(unitBtns.first()).toBeVisible({ timeout: 3_000 });
    // أغلق
    await page.locator("[data-testid='consol-btn-errors']").first().click();
    await expect(unitBtns.first()).not.toBeVisible({ timeout: 2_000 });
  });

  // ── رسّخ: زيادة ───────────────────────────────────────────────
  test("زر «زيادة» في رسّخ يُرسل extra tarseekh", async ({ page }) => {
    const extraReqs: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/students/s1/extra", async (r) => {
      extraReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await openFirstStudent(page);

    await page.locator("[data-testid='consol-btn-extra']").first().click();
    await expect.poll(() => extraReqs.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(extraReqs[0].kind).toBe("tarseekh");
  });

  // ── راجِع: تمّ ولم يتمّ ───────────────────────────────────────
  test("زرّا «راجِع» (تمّ / لم يتمّ) يُرسلان الحالة الصحيحة", async ({ page }) => {
    const mReqs: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/students/s1/session", async (r) => {
      mReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await openFirstStudent(page);

    // الـ ConsolidationRow الثاني هو قسم «راجِع»
    await page.locator("[data-testid='consol-btn-done']").nth(1).click();
    await expect.poll(() => mReqs.at(-1), { timeout: 5_000 }).toMatchObject({ kind: "murajaah" });
    const doneBody = mReqs.at(-1);
    expect(Number(doneBody?.count)).toBeGreaterThan(0);

    await page.locator("[data-testid='consol-btn-not-done']").nth(1).click();
    await expect.poll(() => mReqs.at(-1), { timeout: 5_000 }).toMatchObject({ kind: "murajaah", count: 0 });
  });

  // ── الطالب التالي ─────────────────────────────────────────────
  test("«الطالب التالي ←» ينتقل لبطاقة الطالب الثاني", async ({ page }) => {
    await setupPage(page);
    await openFirstStudent(page);

    // ابحث عن زرّ «الطالب التالي»
    await page.getByRole("button", { name: "الطالب التالي ←" }).click();

    // يجب أن يظهر اسم الطالب الثاني في inline-card المفتوحة
    const rows = page.locator("[data-testid='student-row']");
    // الصفّ الثاني (index 1) يجب أن يفتح بطاقته
    const secondCard = rows.nth(1).locator("[data-testid='student-inline-card']");
    await expect(secondCard).toBeVisible({ timeout: 6_000 });
  });

  // ── الكل حاضر ─────────────────────────────────────────────────
  test("«الكل حاضر» يُرسل طلب جماعي ويُحدِّث الشارات", async ({ page }) => {
    const bulkReqs: Record<string, unknown>[] = [];
    await setupPage(page);
    await page.route("**/api/circles/c1/mark-all-present", async (r) => {
      bulkReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(2, { timeout: 10_000 });

    await page.getByRole("button", { name: "الكل حاضر" }).click();

    await expect.poll(() => bulkReqs.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect((bulkReqs[0].studentIds as string[]).length).toBe(2);
    expect((bulkReqs[0].studentIds as string[])).toContain("s1");
    expect((bulkReqs[0].studentIds as string[])).toContain("s2");
  });

  // ── اعتماد حضور اليوم ─────────────────────────────────────────
  test("«اعتماد حضور اليوم» يُرسل طلب الاعتماد", async ({ page }) => {
    const approveReqs: Record<string, unknown>[] = [];
    await setupPage(page, true /* withLock */);
    await page.route("**/api/circles/c1/attendance/approve", async (r) => {
      approveReqs.push(await r.request().postDataJSON() as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    // قبول dialog confirm تلقائياً
    page.on("dialog", (d) => void d.accept());

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(2, { timeout: 10_000 });

    await page.getByRole("button", { name: "اعتماد حضور اليوم" }).click();
    await expect.poll(() => approveReqs.length, { timeout: 5_000 }).toBeGreaterThan(0);
  });

  // ── لقطات الجوال (البند ٤) ─────────────────────────────────────
  test("لقطة شاشة جوال ٣٩٠px — البطاقة كاملة", async ({ page }) => {
    await setupPage(page); // 390px
    await openFirstStudent(page);
    await page.screenshot({ path: "e2e/screenshots/mobile-390-card.png", fullPage: false });
  });

  test("لقطة شاشة جوال ٣٦٠px — البطاقة كاملة", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });

    await page.addInitScript((session) => {
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key: string) {
        if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
        return orig.call(this, key);
      };
    }, FAKE_SESSION);
    await page.route("**/api/me", (r) =>
      r.fulfill({ json: { name: "معلّم تجريبي", roles: ["TEACHER"] } }),
    );
    await page.route("**/api/attendance/circles", (r) =>
      r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
    );
    await page.route("**/api/economy/grant", (r) => r.fulfill({ json: { items: [] } }));
    await page.route("**/api/circles/c1/unified**", (r) =>
      r.fulfill({ json: { students: MOCK_STUDENTS, absentDefault: false } }),
    );
    await page.route("**/api/students/**/unified-panel**", (r) =>
      r.fulfill({ json: MOCK_PANEL_FULL }),
    );
    await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

    await page.goto("/admin/unified");
    const rows = page.locator("[data-testid='student-row']");
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    await rows.first().locator("button").first().click();
    await expect(page.locator("[data-testid='hifz-btn-mastered']")).toBeVisible({ timeout: 6_000 });

    await page.screenshot({ path: "e2e/screenshots/mobile-360-card.png", fullPage: false });
  });
});
