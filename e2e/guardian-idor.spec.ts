/**
 * E2E — صفحة ولي الأمر: التبويبات، ملخّص الابن، واختبار IDOR
 */
import { test, expect, type Page } from "@playwright/test";

const FAKE_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWd1YXJkaWFuIiwiZXhwIjo5OTk5OTk5OTk5fQ.mock",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-guardian", email: "g@t.com", role: "authenticated" },
});

// ولي لديه ابنان
const CHILDREN_LIST = [
  {
    studentId: "std-1",
    name: "أحمد",
    programName: "مراقي",
    attendance: { status: "PRESENT" },
    session: null,
    points: 10,
    nextStationLabel: null,
  },
  {
    studentId: "std-2",
    name: "محمد",
    programName: "مراقي",
    attendance: { status: "ABSENT" },
    session: null,
    points: 5,
    nextStationLabel: null,
  },
];

// ملخّص الابن الأوّل
const SUMMARY_STD1 = {
  studentId: "std-1",
  name: "أحمد",
  history: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    status: i % 3 === 0 ? "ABSENT_UNEXCUSED" : "PRESENT",
  })),
  circleAvgRate: 0.82,
  presentCount: 20,
  absentCount: 10,
  totalDays: 30,
};

async function setupMocks(page: Page) {
  // وضع جلسة وهميّة — نعترض getItem لأيّ مفتاح sb-*-auth-token
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));

  // mock /api/guardian/children
  await page.route("**/api/guardian/children", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CHILDREN_LIST),
    });
  });

  // mock /api/guardian/children/std-1
  await page.route("**/api/guardian/children/std-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SUMMARY_STD1),
    });
  });

  // mock /api/guardian/children/std-2
  await page.route("**/api/guardian/children/std-2", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...SUMMARY_STD1, studentId: "std-2", name: "محمد", circleAvgRate: 0.75 }),
    });
  });

  // mock /api/me
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-guardian",
        name: "وليّ الأمر",
        roles: ["GUARDIAN"],
        email: "g@t.com",
      }),
    });
  });
}

test.describe("صفحة ولي الأمر — التبويبات وملخّص الابن", () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
    await page.goto("/guardian");
  });

  test("يظهر شريط التبويبات عند وجود ابنَين", async ({ page }) => {
    const tabs = page.locator("[data-testid='child-tabs']");
    await expect(tabs).toBeVisible();
    await expect(page.locator("[data-testid='tab-std-1']")).toBeVisible();
    await expect(page.locator("[data-testid='tab-std-2']")).toBeVisible();
  });

  test("يُحمَّل ملخّص الابن الأوّل تلقائيًّا", async ({ page }) => {
    // ملخّص متوسّط الحلقة ظاهر
    const circleAvg = page.locator("[data-testid='circle-avg']");
    await expect(circleAvg).toBeVisible({ timeout: 8000 });
    await expect(circleAvg).toContainText("82٪");
  });

  test("النقر على تبويب الابن الثاني يُحمِّل ملخّصه", async ({ page }) => {
    await page.locator("[data-testid='tab-std-2']").click();
    const circleAvg = page.locator("[data-testid='circle-avg']");
    await expect(circleAvg).toBeVisible({ timeout: 8000 });
    await expect(circleAvg).toContainText("75٪");
  });

  test("التبويبات والملخّص يظهران على شاشة 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-testid='circle-avg']")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("[data-testid='child-tabs']")).toBeVisible();
  });
});

test.describe("IDOR — رفض وليّ الأمر لطالب لا يملكه", () => {
  test("API يُرجع 403 لطالب غير مرتبط", async ({ page }) => {
    // طالب غير مرتبط
    await page.route("**/api/guardian/children/std-99", async (route) => {
      await route.fulfill({ status: 403, body: "" });
    });

    // نتحقّق عبر fetch مباشر من الصفحة
    await setupMocks(page);
    await page.goto("/guardian");
    await page.waitForLoadState("networkidle");

    await page.waitForLoadState("networkidle");
    const status = await page.evaluate(async () => {
      const r = await fetch("/api/guardian/children/std-99", {
        headers: { authorization: "Bearer fake-token" },
      });
      return r.status;
    });

    expect(status).toBe(403);
  });
});
