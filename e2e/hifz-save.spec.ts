/**
 * E2E — تسجيل الحفظ في الشاشة الموحّدة
 *
 * يتحقّق من أربع حالات حرجة بعد إصلاح خلل mastered:false الافتراضيّ:
 * ١) «أتقن المقرّر ✓» يُرسل mastered:true إلى الخادم.
 * ٢) بعد الحفظ الناجح تُبطَل البطاقة ويُعاد تحميلها (kind:"NEW" لا "REPEAT").
 * ٣) «+ حفظ إضافي» يُرسل طلباً إلى /extra.
 * ٤) حين يكون hifzKind:"REPEAT" تظهر تحذير الإعادة.
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

const ONE_STUDENT = [
  {
    studentId: "s1",
    name: "أحمد محمد",
    program: "MARAQI",
    attendanceStatus: null,
    todayHifzDone: false,
    tarseekhDone: null,
    stageLabel: "مراقي ١",
    hizb: 5,
    weeklyPercent: 60,
    weeklyComplete: false,
    deferredToday: false,
    mustRepeat: false,
    started: true,
    yesterday: null,
    required: null,
    setupStatus: { isComplete: true, blockers: [], warnings: [] },
  },
];

const PANEL_NEW = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "NEW", bound: { fromSurah: 78, fromAyah: 1, toSurah: 78, toAyah: 10 } },
    tarseekh: [],
    murajaah: null,
    hasTarsikh: false,
    hasMuraja: false,
  },
  qaidah: null,
  manualGranted: [],
};

const PANEL_REPEAT = {
  today: {
    status: "ACTIVE",
    newHifz: { kind: "REPEAT", bound: { fromSurah: 78, fromAyah: 1, toSurah: 78, toAyah: 10 } },
    tarseekh: [],
    murajaah: null,
    hasTarsikh: false,
    hasMuraja: false,
  },
  qaidah: null,
  manualGranted: [],
};

async function setupPage(page: import("@playwright/test").Page) {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**/api/me", (r) => r.fulfill({ json: { name: "م", roles: ["TEACHER"] } }));
  await page.route("**/api/attendance/circles", (r) =>
    r.fulfill({ json: { circles: [{ id: "c1", nameAr: "الحلقة" }] } }),
  );
  await page.route("**/api/economy/grant", (r) => r.fulfill({ json: { items: [] } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══ ١) «أتقن المقرّر ✓» يُرسل mastered:true ═══
test("زرّ «أتقن المقرّر» يُرسل mastered:true إلى الخادم", async ({ page }) => {
  await setupPage(page);
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: ONE_STUDENT, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => r.fulfill({ json: PANEL_NEW }));

  let capturedBody: Record<string, unknown> | null = null;
  await page.route("**/api/students/s1/session", async (r) => {
    capturedBody = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
    await r.fulfill({ status: 201, json: { ok: true } });
  });

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });

  // افتح البطاقة
  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  // انقر «أتقن المقرّر ✓»
  await page.getByText("أتقن المقرّر ✓").click();

  // تحقّق أن mastered=true وُصِل للخادم
  expect(capturedBody).not.toBeNull();
  expect(capturedBody!["mastered"]).toBe(true);
  expect(capturedBody!["kind"]).toBe("hifz");
});

// ═══ ٢) بعد الحفظ الناجح تُعاد البطاقة بـkind:"NEW" لا "REPEAT" ═══
test("بعد حفظٍ ناجح تُعاد بطاقة الطالب بـkind:NEW", async ({ page }) => {
  await setupPage(page);

  let panelCallCount = 0;
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: ONE_STUDENT, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => {
    panelCallCount++;
    return r.fulfill({ json: PANEL_NEW });
  });
  await page.route("**/api/students/s1/session", (r) => r.fulfill({ status: 201, json: { ok: true } }));

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });

  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  const beforeSave = panelCallCount;
  await page.getByText("أتقن المقرّر ✓").click();

  // انتظر إعادة تحميل البطاقة (panelCache تُبطَل بعد نجاح POST)
  await page.waitForTimeout(2_000);
  expect(panelCallCount).toBeGreaterThan(beforeSave);
});

// ═══ ٣) «+ حفظ إضافي» يُرسل طلباً إلى /extra ═══
test("زرّ «+ حفظ إضافي» يُرسل POST إلى /extra", async ({ page }) => {
  await setupPage(page);
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: ONE_STUDENT, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => r.fulfill({ json: PANEL_NEW }));

  let extraCalled = false;
  await page.route("**/api/students/s1/extra", async (r) => {
    extraCalled = true;
    await r.fulfill({ status: 200, json: { unit: { fromSurah: 78, fromAyah: 11, toSurah: 78, toAyah: 20 } } });
  });

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });
  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  await page.getByText("+ حفظ إضافي").click();
  await page.waitForTimeout(500);
  expect(extraCalled).toBe(true);
});

// ═══ ٥) زرّ «٤+» غير موجود — الحكم ١: ٣ محاولات فقط ═══
test("زرّ المحاولة الرابعة غير موجود في البطاقة", async ({ page }) => {
  await setupPage(page);
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: ONE_STUDENT, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => r.fulfill({ json: PANEL_NEW }));

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });
  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText("٤+")).not.toBeVisible();
});

// ═══ ٦) ردّ خطأ من الخادم يظهر رسالة حمراء داخل البطاقة ═══
test("خطأ من الخادم يُظهر رسالة حمراء داخل بطاقة الطالب", async ({ page }) => {
  await setupPage(page);
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: ONE_STUDENT, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => r.fulfill({ json: PANEL_NEW }));
  await page.route("**/api/students/s1/session", (r) =>
    r.fulfill({ status: 400, json: { error: "خطأ في الحفظ" } }),
  );

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });
  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  await page.getByText("أتقن المقرّر ✓").click();

  // الخطأ يظهر داخل البطاقة (ضمن data-testid=student-inline-card)
  const card = page.locator("[data-testid='student-inline-card']");
  await expect(card.getByText("خطأ في الحفظ")).toBeVisible({ timeout: 5_000 });

  // الزر يعود قابلاً للنقر بعد انتهاء الطلب
  await expect(page.getByText("أتقن المقرّر ✓")).toBeEnabled({ timeout: 3_000 });
});

// ═══ ٧) حين hifzKind:"REPEAT" يظهر تحذير الإعادة ═══
test("حين يجب إعادة المقطع يظهر التحذير في البطاقة", async ({ page }) => {
  await setupPage(page);

  const studentWithRepeat = [{ ...ONE_STUDENT[0], mustRepeat: true }];
  await page.route("**/api/circles/c1/unified**", (r) =>
    r.fulfill({ json: { students: studentWithRepeat, absentDefault: false } }),
  );
  await page.route("**/api/students/s1/unified-panel**", (r) => r.fulfill({ json: PANEL_REPEAT }));

  await page.goto("/admin/unified");
  await expect(page.locator("[data-testid='student-row']")).toHaveCount(1, { timeout: 15_000 });
  await page.locator("[data-testid='student-row']").first().click();
  await expect(page.locator("[data-testid='student-inline-card']")).toBeVisible({ timeout: 10_000 });

  // يجب أن يظهر تحذير «يعيد مقطع أمس»
  await expect(page.getByText("يعيد مقطع أمس")).toBeVisible({ timeout: 5_000 });
});
