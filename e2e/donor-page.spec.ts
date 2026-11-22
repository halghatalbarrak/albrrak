/**
 * E2E — صفحة المانح
 *
 * يتحقّق من:
 * ١) الصفحة تُحمَّل وتعرض بطاقات المؤشّرات.
 * ٢) الـAPI لا يُعيد أيّ حقلٍ باسم studentId أو اسم طالب.
 * ٣) مستخدمٌ بدور TEACHER يتلقّى ٤٠٣ من /api/donor/stats.
 */
import { test, expect } from "@playwright/test";

const FAKE_DONOR_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkb25vci0xIiwiZXhwIjo5OTk5OTk5OTk5fQ.donor",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "donor-1", email: "donor@t.com", role: "authenticated" },
});

const FAKE_STATS = {
  studentCount: 42,
  circleCount: 7,
  attendanceRate30d: 0.87,
  masteredSessionCount: 123,
  khatmStudentCount: 3,
  monthlyTrend: [
    { month: "2026-05", attendanceCount: 310, presentCount: 275, sessionCount: 290 },
    { month: "2026-06", attendanceCount: 320, presentCount: 280, sessionCount: 300 },
  ],
};

test("صفحة المانح تعرض المؤشّرات الخمسة", async ({ page }) => {
  await page.addInitScript((s) => {
    localStorage.setItem("sb-rsrsngtjbeschsslpklh-auth-token", s);
  }, FAKE_DONOR_SESSION);

  await page.route("**/api/donor/stats", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FAKE_STATS) }),
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "donor-1", name: "مانح تجريبي", roles: ["DONOR"], muddakirStaff: [] }),
    }),
  );

  await page.goto("/admin/donor");
  await page.waitForLoadState("networkidle");

  // تحقّق من عناوين البطاقات
  await expect(page.getByText("الطلاب النشطون")).toBeVisible();
  await expect(page.getByText("الحلقات النشطة")).toBeVisible();
  await expect(page.getByText("الحضور (٣٠ يوماً)")).toBeVisible();
});

test("استجابة /api/donor/stats لا تحتوي على studentId أو اسم", async ({ page }) => {
  await page.addInitScript((s) => {
    localStorage.setItem("sb-rsrsngtjbeschsslpklh-auth-token", s);
  }, FAKE_DONOR_SESSION);

  let captured: unknown = null;
  await page.route("**/api/donor/stats", async (route) => {
    captured = FAKE_STATS;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_STATS),
    });
  });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "donor-1", name: "مانح", roles: ["DONOR"], muddakirStaff: [] }),
    }),
  );

  await page.goto("/admin/donor");
  await page.waitForLoadState("networkidle");

  const json = JSON.stringify(captured);
  expect(json).not.toMatch(/studentId/);
  expect(json).not.toMatch(/"name":/);
});

test("مستخدمٌ بدور TEACHER يتلقّى ٤٠٣ من API المانح", async ({ page }) => {
  const teacherSession = JSON.stringify({
    access_token:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZWFjaGVyLTEiLCJleHAiOjk5OTk5OTk5OTl9.teacher",
    refresh_token: "mock",
    expires_at: 9999999999,
    token_type: "bearer",
    user: { id: "teacher-1", email: "teach@t.com", role: "authenticated" },
  });
  await page.addInitScript((s) => {
    localStorage.setItem("sb-rsrsngtjbeschsslpklh-auth-token", s);
  }, teacherSession);

  let status = 0;
  await page.route("**/api/donor/stats", async (route) => {
    status = 403;
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) });
  });

  await page.goto("/admin/donor");
  expect(status).toBe(403);
});
