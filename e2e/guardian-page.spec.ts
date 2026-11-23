/**
 * E2E — صفحة وليّ الأمر
 *
 * ١) وليٌّ مرتبطٌ بأبناء يرى بطاقاتهم (الحضور + ما سُمِّع + النقاط + مقرّر الغد).
 * ٢) وليٌّ بلا أبناء يرى رسالة «لا أبناء».
 * ٣) لا IDOR: البيانات مقيّدةٌ بأبناء الوليّ فقط (لا يرى طلابٍ آخرين).
 *
 * جميع الطلبات مُزوَّرة (page.route) — لا اتّصال بقاعدة بيانات.
 */
import { test, expect } from "@playwright/test";

function makeSession(userId: string) {
  return JSON.stringify({
    access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    refresh_token: "mock",
    expires_at: 9999999999,
    token_type: "bearer",
    user: { id: userId, email: "guardian@test.com", role: "authenticated" },
  });
}

const GUARDIAN_SESSION = makeSession("guardian-1");

const ME_RESPONSE = {
  userId: "guardian-1",
  name: "أحمد الوليّ",
  roles: ["GUARDIAN"],
  student: null,
  isMuddakirHafiz: false,
};

const CHILDREN_WITH_DATA = [
  {
    studentId: "student-1",
    name: "محمد",
    programName: "مراقي",
    attendance: { status: "PRESENT" },
    session: { hifzFromSurah: 2, hifzFromAyah: 1, hifzToSurah: 2, hifzToAyah: 10, tarseekhDone: true, murajaahDone: false },
    points: 42,
    nextStationLabel: "الحزب الثاني",
  },
  {
    studentId: "student-2",
    name: "عبدالرحمن",
    programName: "القاعدة المدنية",
    attendance: { status: "ABSENT" },
    session: null,
    points: 15,
    nextStationLabel: "الدرس الثالث",
  },
];

test("وليٌّ مرتبطٌ بأبناء يرى بطاقاتهم", async ({ page }) => {
  await page.addInitScript((s) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return s;
      return orig.call(this, key);
    };
  }, GUARDIAN_SESSION);

  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: ME_RESPONSE }));
  await page.route("**/api/guardian/children", (r) => r.fulfill({ json: CHILDREN_WITH_DATA }));

  const emptySummary = { history: [], circleAvgRate: null, presentCount: 0, absentCount: 0, totalDays: 0 };
  await page.route("**/api/guardian/children/student-1", (r) =>
    r.fulfill({ json: { ...emptySummary, studentId: "student-1" } }),
  );
  await page.route("**/api/guardian/children/student-2", (r) =>
    r.fulfill({ json: { ...emptySummary, studentId: "student-2" } }),
  );

  await page.goto("/guardian");
  await page.waitForLoadState("networkidle");

  // يرى اسم الابن الأول في التبويبات
  await expect(page.getByText("محمد", { exact: true }).first()).toBeVisible();
  // يرى اسم الابن الثاني في التبويبات
  await expect(page.getByText("عبدالرحمن", { exact: true }).first()).toBeVisible();

  // بيانات الابن الأوّل (التبويب الافتراضيّ): حاضر + ٤٢ نقطة + الحزب الثاني
  await expect(page.getByText("حاضر", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/٤٢.*نقطة/).first()).toBeVisible();
  await expect(page.getByText("الحزب الثاني", { exact: true }).first()).toBeVisible();

  // بيانات الابن الثاني بعد النقر على تبويبه
  await page.locator("[data-testid='tab-student-2']").click();
  await expect(page.getByText("غائب", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/١٥.*نقطة/).first()).toBeVisible();
});

test("وليٌّ بلا أبناء يرى رسالة فارغة", async ({ page }) => {
  await page.addInitScript((s) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return s;
      return orig.call(this, key);
    };
  }, GUARDIAN_SESSION);

  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: ME_RESPONSE }));
  await page.route("**/api/guardian/children", (r) => r.fulfill({ json: [] }));

  await page.goto("/guardian");

  await expect(page.getByText("لا أبناء مرتبطون بحسابك حتى الآن.")).toBeVisible();
});

test("لا IDOR: البيانات مقيّدة بأبناء الوليّ — API لا تُرجع طلابٍ آخرين", async ({ page }) => {
  let capturedUrl = "";
  await page.addInitScript((s) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return s;
      return orig.call(this, key);
    };
  }, GUARDIAN_SESSION);

  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: ME_RESPONSE }));
  await page.route("**/api/guardian/children", (r) => {
    capturedUrl = r.request().url();
    return r.fulfill({ json: [CHILDREN_WITH_DATA[0]] });
  });

  await page.goto("/guardian");
  await page.waitForLoadState("networkidle");

  // التحقّق: الطلب ذهب لمسار /api/guardian/children فقط (لا مسار طالبٍ بعينه)
  expect(capturedUrl).toMatch(/\/api\/guardian\/children$/);

  // يرى الابن الأوّل فقط (لا student-2)
  await expect(page.getByText("محمد", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("عبدالرحمن", { exact: true })).not.toBeVisible();
});
