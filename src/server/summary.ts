import {
  type PrismaClient,
  Role,
  ApprovalStatus,
  ApplicationStatus,
  StudentState,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { type Actor } from "./auth";
import { toDateOnly } from "./attendance";
import { listReadyForHasad } from "./hasad";

// ملخّص الصفحة الرئيسة (المرحلة ٥): أرقامٌ قليلةٌ حسب الدور، وكلٌّ منها بابٌ لإجراء،
// مع «خطوةٍ تالية» واحدةٍ يقترحها النظام — لا يعرض أرقامًا فقط، ولا يترك الشاشة فارغة.
// عرضٌ للقراءة فقط: لا يغيّر شيئًا في القاعدة.

type Tone = "primary" | "bronze" | "success" | "danger";

export interface SummaryCard {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone: Tone;
  href: string;
}

export interface NextStep {
  title: string;
  cta: string;
  href: string;
  tone: "primary" | "bronze" | "success";
}

export interface Summary {
  scope: "manager" | "teacher" | "reciter" | "student";
  greeting: string;
  nextStep: NextStep;
  cards: SummaryCard[];
}

// أرقامٌ هنديّةٌ عربيّة — لتوافق بقيّة الواجهة.
const AR = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number): string => String(n).replace(/\d/g, (d) => AR[Number(d)]);
const frac = (a: number, b: number): string => `${ar(a)}/${ar(b)}`;

// تسميات الحالات — عرضٌ عربيّ لا قاعدة عمل (نسخةٌ خادميّةٌ موجزة).
const STATE_AR: Record<string, string> = {
  APPLIED: "مُقدَّم",
  PENDING_ACCEPTANCE: "بانتظار القبول",
  WAITLISTED: "قائمة الانتظار",
  AWAITING_READING_TEST: "بانتظار اختبار القراءة",
  IN_QAIDAH: "في القاعدة المدنية",
  AWAITING_PACE_TEST: "بانتظار اختبار المقطع",
  PACE_RETEST_SCHEDULED: "إعادة اختبار المقطع",
  IN_MARAQI: "في المراقي",
  COMPLETED: "أتمّ المراقي",
  GRADUATED: "متخرّج",
  WITHDRAWN: "منسحب",
  REJECTED: "مرفوض",
};

// الطلاب «الفعّالون» — في مسار التعلّم (لا المقدَّم ولا المرفوض ولا المنسحب).
const ACTIVE_STUDENT_STATES: StudentState[] = [
  StudentState.AWAITING_READING_TEST,
  StudentState.IN_QAIDAH,
  StudentState.AWAITING_PACE_TEST,
  StudentState.PACE_RETEST_SCHEDULED,
  StudentState.IN_MARAQI,
  StudentState.COMPLETED,
];

/** الملخّص حسب الدور (الأعلى صلاحيّةً يُقدَّم — كترتيب القوائم). */
export async function getSummary(actor: Actor, db: PrismaClient = prisma): Promise<Summary> {
  const has = (r: Role) => actor.roles.includes(r);
  const today = toDateOnly(new Date());

  if (has(Role.CIRCLE_MANAGER) || has(Role.SUPER_ADMIN)) return managerSummary(db, today);
  if (has(Role.TEACHER)) return teacherSummary(db, actor.id, today);
  if (has(Role.RECITER)) return reciterSummary(db, actor.id);
  return studentSummary(db, actor.id);
}

async function managerSummary(db: PrismaClient, today: Date): Promise<Summary> {
  const [students, circlesTotal, pendingApps, pendingApprovals, recordedRows] = await Promise.all([
    db.student.count({ where: { state: { in: ACTIVE_STUDENT_STATES } } }),
    db.circle.count(),
    db.application.count({ where: { status: ApplicationStatus.PENDING } }),
    db.approval.count({ where: { status: ApprovalStatus.PENDING } }),
    db.attendance.findMany({ where: { date: today }, select: { circleId: true }, distinct: ["circleId"] }),
  ]);
  const recorded = recordedRows.length;
  const missing = Math.max(0, circlesTotal - recorded);

  const cards: SummaryCard[] = [
    { key: "students", label: "الطلاب", value: ar(students), hint: "في مسار التعلّم", tone: "primary", href: "/admin/students" },
    { key: "circles", label: "الحلقات", value: ar(circlesTotal), tone: "bronze", href: "/admin/circles" },
    { key: "apps", label: "طلبات معلّقة", value: ar(pendingApps), hint: pendingApps ? "بانتظار القبول" : "لا جديد", tone: pendingApps ? "danger" : "success", href: "/admin/applications" },
    { key: "approvals", label: "اعتمادات معلّقة", value: ar(pendingApprovals), hint: pendingApprovals ? "انتقال/تخرّج" : "لا جديد", tone: pendingApprovals ? "danger" : "success", href: "/admin/approvals" },
    { key: "attendance", label: "حضور اليوم", value: frac(recorded, circlesTotal), hint: "حلقاتٌ رُصدت", tone: circlesTotal > 0 && missing > 0 ? "primary" : "success", href: "/admin/attendance" },
  ];

  let nextStep: NextStep;
  if (pendingApps > 0) {
    nextStep = { title: `لديك ${ar(pendingApps)} طلبَ قيدٍ بانتظار المراجعة`, cta: "راجِع الطلبات", href: "/admin/applications", tone: "primary" };
  } else if (pendingApprovals > 0) {
    nextStep = { title: `لديك ${ar(pendingApprovals)} اعتمادًا معلّقًا (انتقال/تخرّج)`, cta: "افتح الاعتمادات", href: "/admin/approvals", tone: "primary" };
  } else if (circlesTotal > 0 && missing > 0) {
    nextStep = { title: `${ar(missing)} من ${ar(circlesTotal)} حلقةٍ لم يُرصد حضورها اليوم`, cta: "أكمِل رصد الحضور", href: "/admin/attendance", tone: "bronze" };
  } else {
    nextStep = { title: "لا إجراءَ معلّقًا — كلّ شيءٍ محدَّث", cta: "تصفّح الطلاب", href: "/admin/students", tone: "success" };
  }

  return { scope: "manager", greeting: "لوحة الإدارة", nextStep, cards };
}

async function teacherSummary(db: PrismaClient, teacherId: string, today: Date): Promise<Summary> {
  const myCircles = await db.circleTeacher.findMany({ where: { teacherId, endedAt: null }, select: { circleId: true } });
  const circleIds = myCircles.map((c) => c.circleId);

  const [studentsCount, recordedRows, sessionsToday] = await Promise.all([
    db.enrollment.count({ where: { circleId: { in: circleIds }, endedAt: null } }),
    db.attendance.findMany({ where: { circleId: { in: circleIds }, date: today }, select: { circleId: true }, distinct: ["circleId"] }),
    db.dailySession.count({ where: { circleId: { in: circleIds }, date: today } }),
  ]);
  const recorded = recordedRows.length;
  const missing = Math.max(0, circleIds.length - recorded);

  const cards: SummaryCard[] = [
    { key: "circles", label: "حلقاتي", value: ar(circleIds.length), tone: "bronze", href: "/admin/circles" },
    { key: "students", label: "طلاب حلقاتي", value: ar(studentsCount), tone: "primary", href: "/admin/circles" },
    { key: "attendance", label: "حضور اليوم", value: frac(recorded, circleIds.length), hint: "حلقاتٌ رُصدت", tone: circleIds.length > 0 && missing > 0 ? "primary" : "success", href: "/admin/attendance" },
    { key: "session", label: "جلسات اليوم", value: ar(sessionsToday), hint: "سُجّلت", tone: "bronze", href: "/admin/session" },
  ];

  let nextStep: NextStep;
  if (circleIds.length === 0) {
    nextStep = { title: "لم تُسنَد إليك حلقةٌ بعد", cta: "راجِع الحلقات", href: "/admin/circles", tone: "primary" };
  } else if (missing > 0) {
    nextStep = { title: `${ar(missing)} من حلقاتك لم يُرصد حضورها اليوم`, cta: "سجّل الحضور", href: "/admin/attendance", tone: "primary" };
  } else {
    nextStep = { title: "حضور اليوم مكتمل — تابِع الجلسة", cta: "افتح الجلسة اليومية", href: "/admin/session", tone: "bronze" };
  }

  return { scope: "teacher", greeting: "لوحة المعلّم", nextStep, cards };
}

async function reciterSummary(db: PrismaClient, reciterId: string): Promise<Summary> {
  const ready = await listReadyForHasad(reciterId, db);
  const cards: SummaryCard[] = [
    { key: "ready", label: "جاهزون للحصاد", value: ar(ready.length), hint: "أعلنوا الجاهزيّة", tone: ready.length ? "bronze" : "success", href: "/admin/hasad" },
  ];
  const nextStep: NextStep = ready.length
    ? { title: `${ar(ready.length)} طالبٍ بانتظار حصاد حزبه`, cta: "ابدأ الحصاد", href: "/admin/hasad", tone: "bronze" }
    : { title: "لا أحدَ بانتظار الحصاد الآن", cta: "افتح شاشة الحصاد", href: "/admin/hasad", tone: "success" };
  return { scope: "reciter", greeting: "لوحة المُسمِّع", nextStep, cards };
}

async function studentSummary(db: PrismaClient, userId: string): Promise<Summary> {
  const student = await db.student.findUnique({ where: { userId }, select: { state: true } });

  // وليّ أمرٍ بلا حسابِ طالب — يتابع أبناءه من صفحته.
  if (!student) {
    return {
      scope: "student",
      greeting: "أهلًا بك",
      nextStep: { title: "تابِع أبناءك من صفحتك", cta: "افتح صفحتي", href: "/me", tone: "primary" },
      cards: [{ key: "me", label: "صفحتي", value: "افتح", tone: "primary", href: "/me" }],
    };
  }

  const state = student.state;
  const cards: SummaryCard[] = [
    { key: "state", label: "حالتي", value: STATE_AR[state] ?? state, tone: "primary", href: "/me" },
    { key: "civil", label: "السلّم البياني", value: "افتح", hint: "القاعدة المدنية", tone: "bronze", href: "/programs/civil-base" },
    { key: "maraqi", label: "مراقي", value: "افتح", hint: "مراحل الحفظ", tone: "bronze", href: "/programs/maraqi" },
  ];

  let nextStep: NextStep;
  if (state === StudentState.IN_QAIDAH) {
    nextStep = { title: "تابِع تقدّمك في القاعدة المدنية", cta: "افتح السلّم البياني", href: "/programs/civil-base", tone: "primary" };
  } else if (state === StudentState.IN_MARAQI) {
    nextStep = { title: "تابِع محفوظك في المراقي", cta: "افتح مراقي", href: "/programs/maraqi", tone: "primary" };
  } else if (state === StudentState.COMPLETED || state === StudentState.GRADUATED) {
    nextStep = { title: "أتممتَ مسارك — بارك الله فيك", cta: "افتح صفحتي", href: "/me", tone: "success" };
  } else {
    nextStep = { title: `حالتك: ${STATE_AR[state] ?? state}`, cta: "افتح صفحتي", href: "/me", tone: "primary" };
  }

  return { scope: "student", greeting: "أهلًا بك", nextStep, cards };
}
