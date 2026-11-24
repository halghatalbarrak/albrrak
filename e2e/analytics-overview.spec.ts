/**
 * E2E — صفحة التحليلات (لوحة العمل الجديدة)
 * يتحقّق من: التحميل، قسم المتابعة، قسم مُدّكِر، وضع المانح، ٣٩٠px.
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

const DASHBOARD_ADMIN = {
  donorMode: false,
  todayIso: "2026-11-23",
  followUp: [
    {
      studentId: "s1",
      userId: "u1",
      name: "محمد الغائب",
      reasons: ["ABSENT_CONSECUTIVE"],
      circleId: "c1",
      circleName: "حلقة النور",
      teacherName: "الأستاذ أحمد",
    },
  ],
  todayCircles: [
    {
      circleId: "c1",
      circleName: "حلقة النور",
      teacherName: "الأستاذ أحمد",
      teacherUserId: "t1",
      present: 17,
      total: 20,
      recited: 10,
      notRecited: 7,
      opened: true,
    },
    {
      circleId: "c2",
      circleName: "حلقة الفجر",
      teacherName: "الأستاذ خالد",
      teacherUserId: "t2",
      present: 18,
      total: 22,
      recited: 12,
      notRecited: 6,
      opened: true,
    },
  ],
  students: [],
  circleComparison: [],
  charts: [],
  muddakirFollowUp: [
    {
      studentId: "m1",
      userId: "mu1",
      name: "عبدالله الحافظ",
      supervisorName: "المشرف فهد",
      reasons: ["MUDDAKIR_SHORTFALL"],
    },
  ],
};

const DASHBOARD_DONOR = {
  donorMode: true,
  todayIso: "2026-11-23",
  followUp: [],
  todayCircles: [],
  students: [],
  circleComparison: [],
  charts: [],
  muddakirFollowUp: [],
};

async function setupPage(page: Page, roles: string[], dashboard: object) {
  await page.addInitScript((session) => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) return session;
      return orig.call(this, key);
    };
  }, FAKE_SESSION);
  await page.route("**/api/me", (r) => r.fulfill({ json: { name: "م", roles } }));
  await page.route("**/api/admin/dashboard**", (r) => r.fulfill({ json: dashboard }));
  await page.route("**supabase**", (r) => r.fulfill({ json: {} }));
}

// ═══ ١) صفحة التحليلات تظهر للمدير ═══
test("صفحة التحليلات تظهر مع قسمَي المتابعة ومُدّكِر للمدير", async ({ page }) => {
  await setupPage(page, ["CIRCLE_MANAGER"], DASHBOARD_ADMIN);
  await page.goto("/admin/analytics");

  await expect(page.locator("[data-testid='dashboard-content']")).toBeVisible({ timeout: 15_000 });

  // قسم يحتاجون متابعة
  await expect(page.locator("[data-testid='followup-section']")).toBeVisible();
  // اسم الطالب في المتابعة
  await expect(page.getByTestId("followup-name").filter({ hasText: "محمد الغائب" })).toBeVisible();
  // قسم مُدّكِر موجود
  await expect(page.locator("[data-testid='muddakir-section']")).toBeVisible();
});

// ═══ ٢) وضع المانح — لا أسماء ═══
test("وضع المانح لا يُظهر قائمة المتابعة ويعرض ملاحظة المجمّع", async ({ page }) => {
  await setupPage(page, ["DONOR"], DASHBOARD_DONOR);
  await page.goto("/admin/analytics");

  await expect(page.locator("[data-testid='dashboard-content']")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("البيانات مجمّعة")).toBeVisible();
  await expect(page.locator("[data-testid='followup-section']")).not.toBeVisible();
});

// ═══ ٣) لقطة شاشة جوال ٣٩٠px ═══
test("صفحة التحليلات على جوال ٣٩٠px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupPage(page, ["CIRCLE_MANAGER"], DASHBOARD_ADMIN);
  await page.goto("/admin/analytics");
  await expect(page.locator("[data-testid='dashboard-content']")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "e2e/screenshots/analytics-390.png", fullPage: false });
});
