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

const MOCK_STUDENT = {
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
  yesterday: { fromSurah: 78, fromAyah: 1, toSurah: 78, toAyah: 10, mastered: true },
  required: null,
  noTrack: false,
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
async function setupPage(page: Page) {
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
    r.fulfill({ json: { items: [] } }),
  );
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: [MOCK_STUDENT], absentDefault: false } }),
  );
  await page.route("**/api/students/**/unified-panel**", (r) =>
    r.fulfill({ json: MOCK_PANEL }),
  );
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══════════════════════════════════════════════════════════════
// الاختبارات
// ═══════════════════════════════════════════════════════════════
test.describe("تصحيح موضع فردي — النموذج المبسَّط", () => {

  test("النبأ:١٠ يعرض المعاينة ثم يُرسل النطاق الصحيح", async ({ page }) => {
    const corrReqs: Record<string, unknown>[] = [];

    await setupPage(page);

    // mock المعاينة: النبأ:١٠ → الوحدة التالية النبأ:١١→٢٠
    await page.route("**/api/students/s1/position-preview**", (r) =>
      r.fulfill({
        json: { unit: { fromSurah: 78, fromAyah: 11, toSurah: 78, toAyah: 20 } },
      }),
    );

    await page.route("**/api/students/s1/position-correction", async (r) => {
      corrReqs.push((await r.request().postDataJSON()) as Record<string, unknown>);
      await r.fulfill({ json: { ok: true } });
    });

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });

    // افتح بطاقة الطالب
    await page.locator("[data-testid='student-row']").first().click();

    // افتح نموذج التصحيح
    await page.locator("[data-testid='btn-correct-position']").click();

    // تحقّق من ظهور سطر المعاينة
    const preview = page.locator("[data-testid='correction-preview']");
    await expect(preview).toBeVisible({ timeout: 5_000 });

    // المعاينة تحتوي النبأ وأرقاماً مشرقية
    await expect(preview).toContainText("سيكون مقرّر اليوم:", { timeout: 5_000 });
    await expect(preview).toContainText("النبأ");

    // تأكيد التصحيح
    await page.locator("[data-testid='btn-correct-position-submit']").click();

    // انتظر إرسال الطلب
    await expect.poll(() => corrReqs.length, { timeout: 6_000 }).toBeGreaterThan(0);

    // تحقّق من بنية الطلب: fromAyah=1 (محسوب داخلياً)، toAyah=10
    const sent = corrReqs[0] as {
      fromSurah: number; fromAyah: number;
      toSurah: number; toAyah: number;
      reason: string;
    };
    expect(sent.fromSurah).toBe(78);
    expect(sent.fromAyah).toBe(1);
    expect(sent.toSurah).toBe(78);
    expect(sent.toAyah).toBe(10);
    expect(sent.reason).toBe("INPUT_ERROR");
  });

  test("النموذج يعرض أسماء السور (لا أرقاماً حرّة)", async ({ page }) => {
    await setupPage(page);
    await page.route("**/api/students/s1/position-preview**", (r) =>
      r.fulfill({ json: { unit: null } }),
    );

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });
    await page.locator("[data-testid='student-row']").first().click();
    await page.locator("[data-testid='btn-correct-position']").click();

    // تحقّق من وجود SurahSelect (قائمة بأسماء السور)
    const surahSel = page.locator("[data-testid='surah-select']");
    await expect(surahSel).toBeVisible({ timeout: 3_000 });

    // يجب أن تحتوي قائمة السور على "النبأ"
    const optText = await surahSel.locator("option[value='78']").textContent();
    expect(optText).toContain("النبأ");

    // تحقّق من وجود AyahSelect (قائمة بعدد آيات السورة)
    const ayahSel = page.locator("[data-testid='ayah-select']");
    await expect(ayahSel).toBeVisible({ timeout: 3_000 });

    // لا توجد حقول إدخال حرّة (input[type='number'])
    await expect(page.locator("[data-testid='btn-correct-position']").locator("xpath=..//input[@type='number']")).toHaveCount(0);
  });

  test("المعاينة تعرض «أتمّ جميع محفوظات المسار» حين لا وحدة تالية", async ({ page }) => {
    await setupPage(page);
    await page.route("**/api/students/s1/position-preview**", (r) =>
      r.fulfill({ json: { unit: null } }),
    );

    await page.goto("/admin/unified");
    await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 10_000 });
    await page.locator("[data-testid='student-row']").first().click();
    await page.locator("[data-testid='btn-correct-position']").click();

    await expect(page.locator("[data-testid='correction-preview']")).toContainText("أتمّ جميع محفوظات المسار", { timeout: 5_000 });
  });
});
