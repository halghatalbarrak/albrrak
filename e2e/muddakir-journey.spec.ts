/**
 * E2E — رحلة مُدَّكِر الكاملة
 *
 * تغطّي الرحلة من الإلحاق حتى تأكيد الأسبوع والنقاط:
 * ١) المدير يُلحق حافظاً باختيار مسار١ ومشرف.
 * ٢) المشرف يرى الحافظ في قائمته (للقراءة فقط).
 * ٣) الحافظ يفتح شاشته ويرى خطّة اليوم.
 * ٤) الحافظ يُتمّ اليوم — الزرّ يتغيّر لـ «اكتمل اليوم ✓».
 * ٥) المشرف يفتح ملف الحافظ ويؤكّد الأسبوع.
 * ٦) النقاط تظهر في شاشة الحافظ (gami).
 *
 * كل الطلبات مُزوَّرة (page.route) — لا اتّصال بقاعدة بيانات.
 */
import { test, expect, type Page } from "@playwright/test";

// ─── جلسات وهميّة ───────────────────────────────────────────────────────────

function makeSession(userId: string, email: string) {
  return JSON.stringify({
    access_token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    refresh_token: "mock",
    expires_at: 9999999999,
    token_type: "bearer",
    user: { id: userId, email, role: "authenticated" },
  });
}

const MANAGER_SESSION = makeSession("manager-1", "manager@test.com");
const SUPERVISOR_SESSION = makeSession("sup-1", "supervisor@test.com");
const HAFIZ_SESSION = makeSession("hafiz-1", "hafiz@test.com");

// ─── بيانات وهميّة ───────────────────────────────────────────────────────────

const SUPERVISOR_ROW = { id: "sup-1", name: "المشرف أحمد", load: 0, max: 4, full: false };

const HAFIZ_ENROLLABLE = { studentId: "s1", name: "الحافظ محمد" };

// تاريخ اليوم بتوقيت مكّة — يطابق تاريخ الأحداث المُنشأة بـbrowserDeps.now()
function makkahToday() {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Riyadh" }).slice(0, 10);
}

const HAFIZ_IN_LIST = {
  studentId: "s1",
  name: "الحافظ محمد",
  stage: 1,
  supervisorId: "sup-1",
  supervisorName: "المشرف أحمد",
  deliveryMode: "IN_PERSON",
  track: 1,
  mode: "ACTIVE",
};

const TODAY_VIEW = {
  dayDate: makkahToday(),
  track: 1,
  reviewOnly: false,
  status: "ACTIVE",
  phase: "MEMORIZE",
  ward: null,
  stage: { number: 1, startJuz: 1, endJuz: 5, faceInStage: 3, stageTotal: 50, currentPage: 5 },
  meeting: { day: "الأربعاء", facesToRead: 3 },
  plan: {
    dayDate: makkahToday(),
    reviewOnly: false,
    excused: false,
    yesterday: [5],
    newFaces: [6],
    ribat: [2, 3, 4],
    reviewSlice: [1],
    newRange: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 7 },
    linkingAyah: null,
    yesterdayLinkingAyah: null,
    openTreatments: [],
    makeup: null,
  },
  settings: { newReps: 30, firstCleanReps: 3, yesterdayReps: 10, treatmentLineReps: 5 },
  trackChange: { tracks: [1, 2, 3], pendingTrack: null, effectiveFrom: null, requestedTrack: null },
  stageProgress: {
    stage: 1, memorized: 3, total: 50,
    ready: false, awaitingFinal: false, graduated: false,
  },
  gami: null,
};

const TODAY_VIEW_WITH_GAMI = {
  ...TODAY_VIEW,
  gami: { streakCurrent: 3, streakLongest: 7, badgeCount: 1, latestBadge: { nameAr: "أوّل أسبوع", emoji: "🏅" } },
};

const SUP_INDICATORS = [{
  studentId: "s1",
  name: "الحافظ محمد",
  stage: 1,
  track: 1,
  shortfallDays: 0,
  makeupPending: 0,
  excusesThisMonth: 0,
  excuseLimit: 5,
  excuseLimitExceeded: false,
  repErrors: 0,
  weakFaces: 0,
  openTreatments: 0,
  trackRequestPending: false,
}];

const SUP_DETAIL = {
  studentId: "s1",
  name: "الحافظ محمد",
  track: 1,
  pendingTrack: null,
  effectiveFrom: null,
  reviewCycleDays: 7,
  tracks: [1, 2, 3],
  week: {
    weekStart: "2026-11-11",
    weekEnd: "2026-11-17",
    meetingDay: "الأربعاء",
    confirmed: false,
    heardCount: 0,
  },
  facesToHear: [{ page: 6, weak: false }],
  heardThisWeek: [],
  openTreatments: [],
  trackRequest: null,
  stageProgress: {
    stage: 1, memorized: 3, total: 50,
    ready: false, mode: "ACTIVE", awaitingFinal: false, graduated: false,
  },
  tathbit: null,
  indicators: SUP_INDICATORS[0],
};

// ─── مساعد حقن الجلسة ────────────────────────────────────────────────────────

async function injectSession(page: Page, sessionJson: string) {
  await page.addInitScript((s) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return s;
      return orig.call(this, key);
    };
  }, sessionJson);
}

// ─── ١) المدير يُلحق حافظاً باختيار مسار١ ومشرف ────────────────────────────

test("المدير يُلحق حافظاً باختيار المسار والمشرف", async ({ page }) => {
  await injectSession(page, MANAGER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المدير", roles: ["SUPER_ADMIN"], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/staff**", (r) =>
    r.fulfill({ status: 403, json: { error: "forbidden" } }),
  );

  let callCount = 0;
  let postedBody: Record<string, unknown> | null = null;
  await page.route("**/api/muddakir", async (r) => {
    if (r.request().method() === "GET") {
      callCount++;
      // بعد الإلحاق يعود الحافظ في القائمة
      const hafiz = callCount > 1 ? [HAFIZ_IN_LIST] : [];
      return r.fulfill({ json: { canManage: true, hafiz, supervisors: [SUPERVISOR_ROW], enrollable: [HAFIZ_ENROLLABLE] } });
    }
    // POST — سجِّل الجسم وأجب بـ201
    postedBody = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
    return r.fulfill({ status: 201, json: { executed: true } });
  });

  await page.goto("/admin/muddakir");
  await expect(page.getByLabel("اختر حافظًا")).toBeVisible({ timeout: 15_000 });

  // اختر الحافظ
  await page.getByLabel("اختر حافظًا").selectOption({ value: "s1" });

  // اختر المسار ١
  await page.getByLabel("المسار").selectOption({ value: "1" });

  // اختر المشرف
  await page.getByLabel("المشرف عند الإلحاق (اختياريّ)").selectOption({ value: "sup-1" });

  // انقر «إلحاق»
  await page.getByRole("button", { name: "إلحاق" }).click();

  // تحقّق من الجسم المُرسَل
  await page.waitForTimeout(1_000);
  expect(postedBody).not.toBeNull();
  expect(postedBody!["action"]).toBe("enroll");
  expect(postedBody!["studentId"]).toBe("s1");
  expect(postedBody!["track"]).toBe(1);
  expect(postedBody!["supervisorId"]).toBe("sup-1");
});

// ─── ٢) المشرف يرى حافظه في القائمة (للقراءة فقط) ──────────────────────────

test("المشرف يرى حافظه في جدول القراءة", async ({ page }) => {
  await injectSession(page, SUPERVISOR_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المشرف أحمد", roles: ["ARIF"], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/staff**", (r) =>
    r.fulfill({ status: 403, json: { error: "forbidden" } }),
  );
  await page.route("**/api/muddakir", (r) =>
    r.fulfill({ json: { canManage: false, hafiz: [HAFIZ_IN_LIST], supervisors: [], enrollable: [] } }),
  );

  await page.goto("/admin/muddakir");

  // يظهر اسم الحافظ في الجدول
  await expect(page.getByText("الحافظ محمد")).toBeVisible({ timeout: 15_000 });

  // لا يوجد زرّ إلحاق (عرض للقراءة فقط)
  await expect(page.getByRole("button", { name: "إلحاق" })).not.toBeVisible();
});

// ─── ٣) الحافظ يفتح شاشته ويرى خطّة اليوم ──────────────────────────────────

test("الحافظ يرى خطّة يومه في شاشة المُدَّكِر", async ({ page }) => {
  await injectSession(page, HAFIZ_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "الحافظ محمد", roles: [], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/today**", (r) => r.fulfill({ json: TODAY_VIEW }));
  await page.route("**/api/muddakir/events**", (r) => r.fulfill({ json: { processed: 0 } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  await page.goto("/muddakir");

  // يظهر زرّ الإتمام
  await expect(page.getByRole("button", { name: "إتمام اليوم" })).toBeVisible({ timeout: 15_000 });

  // يظهر ركن الجديد
  await expect(page.getByText("الجديد")).toBeVisible();
});

// ─── ٤) الحافظ يُتمّ اليوم — الزرّ يتغيّر لـ «اكتمل اليوم ✓» ───────────────

test("الحافظ ينقر «إتمام اليوم» والزرّ يتغيّر", async ({ page }) => {
  await injectSession(page, HAFIZ_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "الحافظ محمد", roles: [], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/today**", (r) => r.fulfill({ json: TODAY_VIEW }));
  await page.route("**/api/muddakir/events**", (r) => r.fulfill({ json: { processed: 1 } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  await page.goto("/muddakir");
  await expect(page.getByRole("button", { name: "إتمام اليوم" })).toBeEnabled({ timeout: 15_000 });

  await page.getByRole("button", { name: "إتمام اليوم" }).click();

  // بعد الإتمام يتغيّر نصّ الزرّ ويصبح معطَّلاً
  await expect(page.getByText("اكتمل اليوم ✓")).toBeVisible({ timeout: 5_000 });
});

// ─── ٥) المشرف يفتح ملف الحافظ ويؤكّد الأسبوع ──────────────────────────────

test("المشرف يؤكّد الأسبوع ويظهر «الأسبوع مؤكّد ✓»", async ({ page }) => {
  await injectSession(page, SUPERVISOR_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المشرف أحمد", roles: ["ARIF"], muddakirStaff: [] } }),
  );

  let postedAction: string | null = null;
  let detailConfirmed = false;
  await page.route("**/api/muddakir/supervisor**", async (r) => {
    if (r.request().method() === "GET") {
      const url = r.request().url();
      if (url.includes("studentId=")) {
        // بعد confirmWeek يعيد الخادم confirmed:true — يجب أن تعكسه المحاكاة
        return r.fulfill({ json: { ...SUP_DETAIL, week: { ...SUP_DETAIL.week, confirmed: detailConfirmed } } });
      }
      return r.fulfill({ json: { hafiz: SUP_INDICATORS } });
    }
    // POST
    const body = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
    postedAction = body["action"] as string;
    if (postedAction === "confirmWeek") detailConfirmed = true;
    return r.fulfill({ json: { ok: true } });
  });

  await page.goto("/muddakir/supervisor");

  // يظهر اسم الحافظ
  await expect(page.getByText("الحافظ محمد")).toBeVisible({ timeout: 15_000 });

  // افتح ملف الحافظ
  await page.getByRole("button", { name: "فتح" }).first().click();
  await expect(page.getByRole("button", { name: "تأكيد انتظام الأسبوع" })).toBeVisible({ timeout: 5_000 });

  // أكِّد الأسبوع
  await page.getByRole("button", { name: "تأكيد انتظام الأسبوع" }).click();

  // تحقّق من الإجراء المُرسَل
  await page.waitForTimeout(500);
  expect(postedAction).toBe("confirmWeek");

  // يظهر «الأسبوع مؤكّد ✓»
  await expect(page.getByText("الأسبوع مؤكّد ✓")).toBeVisible({ timeout: 5_000 });
});

// ─── ٦) النقاط تظهر في شاشة الحافظ (gami) ──────────────────────────────────

test("بعد الأسبوع المؤكَّد تظهر بطاقة النقاط في شاشة الحافظ", async ({ page }) => {
  await injectSession(page, HAFIZ_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "الحافظ محمد", roles: [], muddakirStaff: [] } }),
  );
  // today_view يعود بـgami بعد الأسبوع المؤكَّد
  await page.route("**/api/muddakir/today**", (r) => r.fulfill({ json: TODAY_VIEW_WITH_GAMI }));
  await page.route("**/api/muddakir/events**", (r) => r.fulfill({ json: { processed: 0 } }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  await page.goto("/muddakir");

  // بطاقة النقاط تظهر مع السلسلة (🔥 ٣)
  await expect(page.getByText("🔥")).toBeVisible({ timeout: 15_000 });
  // الوسام الأخير
  await expect(page.getByText("أوّل أسبوع")).toBeVisible();
});

// ─── ٧) المدير ينقل الحافظ من مشرفٍ إلى آخر ────────────────────────────────

const SUPERVISOR_ROW_B = { id: "sup-2", name: "المشرف خالد", load: 1, max: 4, full: false };

test("المدير ينقر «نقل» ويُسند الحافظ لمشرفٍ جديد", async ({ page }) => {
  await injectSession(page, MANAGER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المدير", roles: ["SUPER_ADMIN"], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/staff**", (r) =>
    r.fulfill({ status: 403, json: { error: "forbidden" } }),
  );

  let postedBody: Record<string, unknown> | null = null;
  await page.route("**/api/muddakir", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { canManage: true, hafiz: [HAFIZ_IN_LIST], supervisors: [SUPERVISOR_ROW, SUPERVISOR_ROW_B], enrollable: [] } });
    postedBody = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
    return r.fulfill({ status: 201, json: { executed: true } });
  });

  await page.goto("/admin/muddakir");

  // انتظر ظهور الجدول
  await expect(page.getByText("الحافظ محمد")).toBeVisible({ timeout: 15_000 });

  // انقر «نقل» لفتح حقل الاختيار
  await page.getByRole("button", { name: "نقل" }).first().click();

  // اختر المشرف الجديد
  await page.getByLabel("اختر مشرفًا").selectOption({ value: "sup-2" });

  // أكِّد النقل
  await page.getByRole("button", { name: "تأكيد النقل" }).click();

  await page.waitForTimeout(500);
  expect(postedBody).not.toBeNull();
  expect(postedBody!["action"]).toBe("assign");
  expect(postedBody!["studentId"]).toBe("s1");
  expect(postedBody!["supervisorId"]).toBe("sup-2");
});

// ─── ٩) مدير البرنامج يعدّل إعداداً وتُرسَل القيمة صحيحة ───────────────────

const ADMIN_SETTINGS_PAYLOAD = {
  canManage: true,
  ladder: [],
  settings: { maxHafizPerSupervisor: 4, stageJuzCount: 5, meetingDay: 3, newReps: 30, tracks: [1,2,3] },
  pointItems: [],
  raises: [],
};

test("مدير البرنامج يغيّر «أقصى حفّاظ للمشرف» والقيمة تُرسَل صحيحة", async ({ page }) => {
  await injectSession(page, MANAGER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المدير", roles: ["SUPER_ADMIN"], muddakirStaff: [] } }),
  );

  let postedBody: Record<string, unknown> | null = null;
  await page.route("**/api/muddakir/admin", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: ADMIN_SETTINGS_PAYLOAD });
    postedBody = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
    return r.fulfill({ json: { executed: true } });
  });

  await page.goto("/admin/muddakir/tathbit");

  // ينتظر ظهور الإعدادات
  await expect(page.getByText("أقصى حفّاظ للمشرف")).toBeVisible({ timeout: 15_000 });

  // يغيّر «أقصى حفّاظ للمشرف» من ٤ إلى ٣
  await page.getByLabel("أقصى حفّاظ للمشرف").selectOption({ value: "3" });

  // ينقر «حفظ» للإعداد — السيلكت أخو الزرّ مباشرةً في نفس السطر
  await page.getByLabel("أقصى حفّاظ للمشرف").locator("xpath=following-sibling::button[1]").click();

  await page.waitForTimeout(500);
  expect(postedBody).not.toBeNull();
  expect(postedBody!["action"]).toBe("setting");
  expect(postedBody!["key"]).toBe("maxHafizPerSupervisor");
  expect(postedBody!["value"]).toBe(3);
});

// ─── ٨) زرّ «فتح نموذج الإلحاق» في صفحة الطلبات يمرّر الـprefill ────────────

test("زرّ فتح نموذج الإلحاق يملأ الحقول مسبقاً", async ({ page }) => {
  await injectSession(page, MANAGER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المدير", roles: ["SUPER_ADMIN"], muddakirStaff: [] } }),
  );
  await page.route("**/api/muddakir/staff**", (r) =>
    r.fulfill({ status: 403, json: { error: "forbidden" } }),
  );
  await page.route("**/api/muddakir/requests**", (r) =>
    r.fulfill({ json: { canManage: true, pending: [{ id: "req-1", type: "ENROLL", payload: { studentId: "s1", track: 2, supervisorId: "sup-1" }, studentId: "s1", requestedBy: "admin-1", requestedAt: "2026-11-17T10:00:00Z", status: "PENDING", decisionReason: null }], mine: [] } }),
  );
  await page.route("**/api/muddakir", (r) =>
    r.fulfill({ json: { canManage: true, hafiz: [], supervisors: [SUPERVISOR_ROW], enrollable: [HAFIZ_ENROLLABLE] } }),
  );

  await page.goto("/admin/muddakir/requests");

  // يظهر زرّ فتح نموذج الإلحاق
  await expect(page.getByText("فتح نموذج الإلحاق")).toBeVisible({ timeout: 15_000 });

  // انقر الرابط — ينتقل لشاشة الإلحاق بالـprefill
  await page.getByText("فتح نموذج الإلحاق").click();

  // انتظر الانتقال للصفحة
  await page.waitForURL("**/admin/muddakir**", { timeout: 5_000 });

  // تأكّد أنّ الـURL يحمل prefill_track=2
  expect(page.url()).toContain("prefill_track=2");
  expect(page.url()).toContain("prefill_supervisorId=sup-1");
});

// ─── ٩) زرّ «إلحاق بمُدّكِر» في صفحة الطلبات يقبل الطلب وينتقل بـprefill ───

test("إلحاق بمُدّكِر من صفحة الطلبات يقبل ويفتح نموذج الإلحاق", async ({ page }) => {
  await injectSession(page, MANAGER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المدير", roles: ["SUPER_ADMIN"], muddakirStaff: [] } }),
  );
  await page.route("**/api/applications", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { applications: [{ id: "app-1", name: "يوسف سعيد", age: 20, gender: "MALE", nationality: "سعودي", schoolStage: null, guardianPhone: "0501234567", studentPhone: null, priorHifzJuz: 15, status: "PENDING", createdAt: `${makkahToday()}T00:00:00Z` }] } });
    return r.fallback();
  });
  await page.route("**/api/applications/*/decision", (r) =>
    r.fulfill({ json: { studentId: "s_enroll_test", userId: "u_test", guardianLinked: false, createdStudentLogin: false } }),
  );
  await page.route("**/api/muddakir/staff**", (r) =>
    r.fulfill({ status: 403, json: { error: "forbidden" } }),
  );
  await page.route("**/api/muddakir", (r) =>
    r.fulfill({ json: { canManage: true, hafiz: [], supervisors: [SUPERVISOR_ROW], enrollable: [{ studentId: "s_enroll_test", name: "يوسف سعيد" }] } }),
  );

  await page.goto("/admin/applications");

  // تأكّد ظهور الزرّ
  await expect(page.getByRole("button", { name: "إلحاق بمُدّكِر" })).toBeVisible({ timeout: 15_000 });

  // انقر الزرّ — يقبل الطلب وينتقل لشاشة الإلحاق
  await page.getByRole("button", { name: "إلحاق بمُدّكِر" }).click();

  // انتظر الانتقال للصفحة
  await page.waitForURL("**/admin/muddakir**", { timeout: 5_000 });

  // تأكّد أنّ الـURL يحمل prefill_studentId للطالب المقبول
  expect(page.url()).toContain("prefill_studentId=s_enroll_test");
});
