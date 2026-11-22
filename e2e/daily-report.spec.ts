/**
 * E2E — صفحة التقرير اليومي
 *
 * ١) المعلّم يرى تقرير حلقته (الحضور + من سمّع + من لم يسمّع).
 * ٢) المشرف يرى ملخّص الحلقات.
 * ٣) الطالب يرى يومه.
 * ٤) الصفحة تعرض ملخّص لمن لا تقرير له.
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
    user: { id: userId, email: "test@test.com", role: "authenticated" },
  });
}

const TEACHER_SESSION = makeSession("teacher-1");
const SUPERVISOR_SESSION = makeSession("supervisor-1");
const STUDENT_SESSION = makeSession("student-user-1");

const TEACHER_REPORT = [
  {
    kind: "teacher",
    date: "2026-11-22",
    circleName: "حلقة الفجر",
    circleId: "circle-1",
    attendance: { total: 5, present: 3, late: 1, excused: 0, absent: 1, leftEarly: 0, notRecorded: 0 },
    students: [
      { studentId: "s1", name: "أحمد", attendanceStatus: "PRESENT", hasSession: true, hifzRange: "2:1 → 2:10", hifzAttempts: 1, tarseekhDone: true, murajaahDone: false },
      { studentId: "s2", name: "خالد", attendanceStatus: "PRESENT", hasSession: false, hifzRange: null, hifzAttempts: null, tarseekhDone: null, murajaahDone: null },
    ],
    notRecited: [
      { studentId: "s2", name: "خالد", attendanceStatus: "PRESENT", hasSession: false, hifzRange: null, hifzAttempts: null, tarseekhDone: null, murajaahDone: null },
    ],
    repeated: [],
  },
];

const SUPERVISOR_REPORT = {
  kind: "supervisor",
  date: "2026-11-22",
  circles: [
    { circleId: "c1", circleName: "حلقة الفجر", total: 5, present: 4, absent: 1, sessions: 3 },
    { circleId: "c2", circleName: "حلقة العشاء", total: 8, present: 7, absent: 1, sessions: 6 },
  ],
  totals: { total: 13, present: 11, late: 0, excused: 0, absent: 2, leftEarly: 0, notRecorded: 0 },
  totalSessions: 9,
};

const STUDENT_REPORT = {
  kind: "student",
  date: "2026-11-22",
  attendanceStatus: "PRESENT",
  hifzRange: "3:1 → 3:5",
  hifzAttempts: 1,
  tarseekhDone: true,
  murajaahDone: false,
  pointsToday: 25,
};

test("المعلّم يرى تقرير حلقته", async ({ page }) => {
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, TEACHER_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المعلّم", roles: ["TEACHER"], isMuddakirHafiz: false } }),
  );
  await page.route("**/api/report/daily**", (r) =>
    r.fulfill({ json: TEACHER_REPORT }),
  );

  await page.goto("/admin/report");

  await expect(page.getByText("حلقة الفجر")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("أحمد")).toBeVisible();
  // من لم يُسمَّع
  await expect(page.getByText("خالد")).toBeVisible();
});

test("المشرف يرى ملخّص الحلقات", async ({ page }) => {
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, SUPERVISOR_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "المشرف", roles: ["CIRCLE_MANAGER"], isMuddakirHafiz: false } }),
  );
  await page.route("**/api/report/daily**", (r) =>
    r.fulfill({ json: SUPERVISOR_REPORT }),
  );

  await page.goto("/admin/report");

  await expect(page.getByText("حلقة الفجر")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("حلقة العشاء")).toBeVisible();
});

test("الطالب يرى يومه", async ({ page }) => {
  await page.context().addInitScript((s) => {
    localStorage.setItem("sb-access-token", s);
    localStorage.setItem("sb-localhost-auth-token", s);
  }, STUDENT_SESSION);

  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { name: "الطالب", roles: ["STUDENT"], isMuddakirHafiz: false } }),
  );
  await page.route("**/api/report/daily**", (r) =>
    r.fulfill({ json: STUDENT_REPORT }),
  );

  await page.goto("/admin/report");

  await expect(page.getByText(/٢٥.*نقطة/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("3:1 → 3:5")).toBeVisible();
});
