/**
 * E2E — صفحة التحليلات الموحّدة
 * يتحقّق من: التحميل، مبدّل الفترة، القسمان (الحلقات/مُدّكِر)، وضع المانح.
 */
import { test, expect, type Page } from "@playwright/test";

const FAKE_SESSION = JSON.stringify({
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjk5OTk5OTk5OTl9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  refresh_token: "mock",
  expires_at: 9999999999,
  token_type: "bearer",
  user: { id: "user-1", email: "t@t.com", role: "authenticated" },
});

const OVERVIEW_ADMIN = {
  donorMode: false,
  period: "week",
  circles: {
    activeStudents: 42,
    attendanceRate: 0.85,
    masteredSessions: 120,
    khatmCount: 3,
    struggling: 5,
    series: [
      { label: "11-18", present: 30, total: 40, sessions: 15 },
      { label: "11-19", present: 35, total: 40, sessions: 18 },
      { label: "11-20", present: 28, total: 40, sessions: 12 },
      { label: "11-21", present: 32, total: 40, sessions: 14 },
      { label: "11-22", present: 36, total: 40, sessions: 20 },
      { label: "11-23", present: 20, total: 40, sessions: 10 },
      { label: "11-24", present: 25, total: 40, sessions: 11 },
    ],
    circles: [
      { circleId: "c1", name: "حلقة النور", studentCount: 20, present: 17, total: 20, sessions: 60 },
      { circleId: "c2", name: "حلقة الفجر", studentCount: 22, present: 18, total: 22, sessions: 60 },
    ],
  },
  muddakir: {
    activeHuffaz: 8,
    completedDaysInPeriod: 45,
    series: [
      { label: "11-18", completed: 6, total: 8 },
      { label: "11-19", completed: 7, total: 8 },
      { label: "11-20", completed: 5, total: 8 },
      { label: "11-21", completed: 7, total: 8 },
      { label: "11-22", completed: 8, total: 8 },
      { label: "11-23", completed: 6, total: 8 },
      { label: "11-24", completed: 6, total: 8 },
    ],
  },
};

const OVERVIEW_DONOR = {
  donorMode: true,
  period: "week",
  circles: {
    activeStudents: 42,
    attendanceRate: 0.85,
    masteredSessions: 120,
    khatmCount: 3,
    struggling: 5,
    series: OVERVIEW_ADMIN.circles.series,
    circles: [],
  },
  muddakir: {
    activeHuffaz: 8,
    completedDaysInPeriod: 45,
    series: OVERVIEW_ADMIN.muddakir.series,
  },
};

async function setupPage(page: Page, roles: string[], overview: object) {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**/api/me", (r) => r.fulfill({ json: { name: "م", roles } }));
  await page.route("**/api/analytics/overview**", (r) => r.fulfill({ json: overview }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══ ١) صفحة التحليلات تظهر للمدير ═══
test("صفحة التحليلات تظهر مع قسمَي الحلقات ومُدّكِر للمدير", async ({ page }) => {
  await setupPage(page, ["CIRCLE_MANAGER"], OVERVIEW_ADMIN);
  await page.goto("/admin/analytics");

  await expect(page.locator("[data-testid='analytics-content']")).toBeVisible({ timeout: 15_000 });

  // قسم الحلقات موجود
  await expect(page.getByText("الحلقات")).toBeVisible();
  // جدول الحلقات موجود
  await expect(page.getByText("حلقة النور")).toBeVisible();
  // قسم مُدّكِر موجود
  await expect(page.getByText("مُدَّكِر")).toBeVisible();
});

// ═══ ٢) مبدّل الفترة يغيّر الطلب ═══
test("مبدّل الفترة يرسل period=month للخادم", async ({ page }) => {
  await setupPage(page, ["CIRCLE_MANAGER"], OVERVIEW_ADMIN);

  let calledPeriod = "";
  await page.route("**/api/analytics/overview**", (r) => {
    const url = new URL(r.request().url());
    calledPeriod = url.searchParams.get("period") ?? "";
    return r.fulfill({ json: { ...OVERVIEW_ADMIN, period: calledPeriod as "month" } });
  });

  await page.goto("/admin/analytics");
  await expect(page.locator("[data-testid='analytics-content']")).toBeVisible({ timeout: 15_000 });

  await page.locator("[data-testid='period-month']").click();
  await page.waitForTimeout(500);
  expect(calledPeriod).toBe("month");
});

// ═══ ٣) وضع المانح — لا أسماء حلقات ═══
test("وضع المانح لا يُظهر جدول الحلقات", async ({ page }) => {
  await setupPage(page, ["DONOR"], OVERVIEW_DONOR);
  await page.goto("/admin/analytics");

  await expect(page.locator("[data-testid='analytics-content']")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("حلقة النور")).not.toBeVisible();
  await expect(page.getByText("البيانات مجمّعة")).toBeVisible();
});

// ═══ ٤) لقطة شاشة جوال ٣٩٠px ═══
test("صفحة التحليلات على جوال ٣٩٠px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPage(page, ["CIRCLE_MANAGER"], OVERVIEW_ADMIN);
  await page.goto("/admin/analytics");
  await expect(page.locator("[data-testid='analytics-content']")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "e2e/screenshots/analytics-390.png", fullPage: false });
});
