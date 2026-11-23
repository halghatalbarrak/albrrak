/**
 * E2E — لوحة عمل المدير: «يحتاجون متابعة».
 *
 * الطلبات مُزوَّرة (page.route) — لا اتّصال بقاعدة بيانات.
 * الاختبارات الحقيقيّة لمنطق الغياب والمقطع المتكرّر:
 *   src/server/__tests__/dashboard.test.ts (يعمل على Postgres في CI).
 */
import { test, expect } from "@playwright/test";

const mockSession = {
  access_token: "mock-token",
  user: { id: "user-admin" },
};

const mockDashboard = {
  donorMode: false,
  todayIso: "2026-11-23",
  followUp: [
    {
      studentId: "s-absent",
      userId: "u-absent",
      name: "أحمد الغائب",
      reasons: ["ABSENT_CONSECUTIVE"],
      circleId: "c1",
      circleName: "حلقة الفجر",
      teacherName: "أبو محمد",
    },
    {
      studentId: "s-repeated",
      userId: "u-repeated",
      name: "خالد المتكرّر",
      reasons: ["REPEATED_SECTION"],
      circleId: "c1",
      circleName: "حلقة الفجر",
      teacherName: "أبو محمد",
    },
  ],
  todayCircles: [
    {
      circleId: "c1",
      circleName: "حلقة الفجر",
      teacherName: "أبو محمد",
      teacherUserId: "t1",
      present: 5,
      total: 8,
      recited: 3,
      notRecited: 2,
      opened: true,
    },
  ],
  students: [],
  circleComparison: [],
  charts: [],
  muddakirFollowUp: [],
};

function setupMocks(page: import("@playwright/test").Page) {
  page.route("**/auth/v1/token*", async (route) => {
    await route.fulfill({ json: { access_token: "mock-token", token_type: "bearer", expires_in: 3600 } });
  });
  page.route("**/rest/v1/users*", async (route) => {
    await route.fulfill({ json: [] });
  });
  // Supabase auth session
  page.route("**/auth/v1/user*", async (route) => {
    await route.fulfill({ json: { id: "user-admin", email: "admin@test.com" } });
  });
  // useMe / /api/me
  page.route("**/api/me*", async (route) => {
    await route.fulfill({
      json: { id: "user-admin", name: "المدير", roles: ["SUPER_ADMIN"], isActive: true },
    });
  });
  // dashboard data
  page.route("**/api/admin/dashboard*", async (route) => {
    await route.fulfill({ json: mockDashboard });
  });
  // Supabase getSession via Storage mock
  page.addInitScript(() => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        return JSON.stringify({
          access_token: "mock-token",
          refresh_token: "mock-refresh",
          user: { id: "user-admin", email: "admin@test.com" },
          expires_at: Date.now() / 1000 + 3600,
        });
      }
      return orig.call(this, key);
    };
  });
}

test("لوحة العمل — طالب غائب ومقطع متكرّر يظهران بأسمائهما في يحتاجون متابعة", async ({ page }) => {
  setupMocks(page);
  await page.goto("/admin/analytics");

  // انتظار المحتوى
  await page.waitForSelector("[data-testid='dashboard-content']", { timeout: 15000 });

  // يظهر قسم المتابعة
  await expect(page.locator("[data-testid='followup-section']")).toBeVisible();

  // يظهر اسم الطالب الغائب مع سبب الغياب
  await expect(page.getByTestId("followup-name").filter({ hasText: "أحمد الغائب" })).toBeVisible();
  await expect(page.getByTestId("reason-ABSENT_CONSECUTIVE")).toBeVisible();

  // يظهر اسم الطالب بالمقطع المتكرّر مع سببه
  await expect(page.getByTestId("followup-name").filter({ hasText: "خالد المتكرّر" })).toBeVisible();
  await expect(page.getByTestId("reason-REPEATED_SECTION")).toBeVisible();
});

test("لوحة العمل — ٣٦٠ بكسل: القسم قابل للقراءة على الجوّال", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  setupMocks(page);
  await page.goto("/admin/analytics");

  await page.waitForSelector("[data-testid='dashboard-content']", { timeout: 15000 });
  await expect(page.locator("[data-testid='followup-section']")).toBeVisible();

  // تحقّق أنّ الأسماء تظهر (لا تختفي)
  await expect(page.getByTestId("followup-name").first()).toBeVisible();
});
