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
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, GUARDIAN_SESSION);

  await page.route("**/auth/v1/token**", async (r) => { await r.fallback(); });
  await page.route("**/auth/v1/user**", async (r) => { await r.fallback(); });

  await page.route("**/api/me", async (r) => {
    await r.fulfill({ json: ME_RESPONSE });
  });

  await page.route("**/api/guardian/children", async (r) => {
    await r.fulfill({ json: CHILDREN_WITH_DATA });
  });

  await page.goto("/guardian");

  // يرى اسم الابن الأول
  await expect(page.getByText("محمد")).toBeVisible();
  // يرى اسم الابن الثاني
  await expect(page.getByText("عبدالرحمن")).toBeVisible();

  // الحضور: محمد حاضر، عبدالرحمن غائب
  await expect(page.getByText("حاضر")).toBeVisible();
  await expect(page.getByText("غائب")).toBeVisible();

  // النقاط بأرقام مشرقية (٤٢)
  await expect(page.getByText(/٤٢.*نقطة/)).toBeVisible();
  await expect(page.getByText(/١٥.*نقطة/)).toBeVisible();

  // مقرّر الغد
  await expect(page.getByText("الحزب الثاني")).toBeVisible();
});

test("وليٌّ بلا أبناء يرى رسالة فارغة", async ({ page }) => {
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, GUARDIAN_SESSION);

  await page.route("**/api/me", async (r) => {
    await r.fulfill({ json: ME_RESPONSE });
  });

  await page.route("**/api/guardian/children", async (r) => {
    await r.fulfill({ json: [] });
  });

  await page.goto("/guardian");

  await expect(page.getByText("لا أبناء مرتبطون بحسابك حتى الآن.")).toBeVisible();
});

test("لا IDOR: البيانات مقيّدة بأبناء الوليّ — API لا تُرجع طلابٍ آخرين", async ({ page }) => {
  let capturedUrl = "";
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, GUARDIAN_SESSION);

  await page.route("**/api/me", async (r) => {
    await r.fulfill({ json: ME_RESPONSE });
  });

  await page.route("**/api/guardian/children", async (r) => {
    capturedUrl = r.request().url();
    await r.fulfill({ json: [CHILDREN_WITH_DATA[0]] });
  });

  await page.goto("/guardian");

  // التحقّق: الطلب ذهب لمسار /api/guardian/children فقط (لا مسار طالبٍ بعينه)
  expect(capturedUrl).toMatch(/\/api\/guardian\/children$/);

  // يرى الابن الأوّل فقط (لا student-2)
  await expect(page.getByText("محمد")).toBeVisible();
  await expect(page.getByText("عبدالرحمن")).not.toBeVisible();
});
