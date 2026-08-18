import { AttendanceStatus, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getConsolidation, getWeeklyReview } from "./tarseekh";
import { arNum } from "@/lib/format";

// رسائل وليّ الأمر (الفكرة ٩): تقريرٌ أسبوعيّ + تنبيه غياب. القناة الآن داخل المنصّة
// (صفٌّ في GuardianMessage)، والبريد لاحقًا (emailedAt) بلا إعادة بناء. بالحدود لا برقم
// الحزب (قاعدة محمد). أرقامٌ هنديّة. الصياغة قرارُ محمد (ثابتة).

export const KIND_WEEKLY = "WEEKLY";
export const KIND_ABSENCE = "ABSENCE_UNEXCUSED";
const SIGN = "حلقات الشيخ محمد البراك";
const PRESENT_STATUSES: AttendanceStatus[] = [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.LEFT_EARLY];

function toDateOnly(input: string | Date): Date {
  const d = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
/** بداية أسبوع الحلقة = الأحد (الحكم ٣: الأحد→الخميس). */
export function weekStartSunday(date: string | Date): Date {
  const d = toDateOnly(date);
  return new Date(d.getTime() - d.getUTCDay() * 86400000);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ref = (s: number, a: number) => `${arNum(s)}:${arNum(a)}`;

export interface RenderedReport { subject: string; body: string; present: number }

/** يبني تقرير طالبٍ للأسبوع الذي يبدأ weekStart (الأحد). بالحدود، بلا رقم حزب. */
export async function renderWeeklyReport(studentId: string, weekStart: Date, db: PrismaClient = prisma): Promise<RenderedReport | null> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { user: { select: { nameAsInId: true } }, enrollments: { where: { endedAt: null }, select: { circle: { select: { nameAr: true } } } } },
  });
  if (!student) return null;
  const name = student.user.nameAsInId;
  const circle = student.enrollments[0]?.circle.nameAr ?? "—";

  const wkStart = toDateOnly(weekStart);
  const wkEnd = new Date(wkStart.getTime() + 4 * 86400000); // الخميس
  const subject = `تقرير الأسبوع — ${name}`;

  // الحضور: أيّام حضورٍ فعليّ من خمسة.
  const present = await db.attendance.count({ where: { studentId, status: { in: PRESENT_STATUSES }, date: { gte: wkStart, lte: wkEnd } } });

  // غائبٌ طول الأسبوع ⟵ رسالةٌ سائلةٌ مطمئنة لا معاتِبة (قرار محمد).
  if (present === 0) {
    const body = [
      "بسم الله الرحمن الرحيم",
      "السلام عليكم ورحمة الله وبركاته", "",
      `لم نر ابنكم ${name} في حلقة ${circle} هذا الأسبوع، ونسأل الله أن يكون بخير.`,
      "نتطلّع لعودته، وإن كان من عائقٍ نُعينكم عليه فأخبرونا.", "",
      SIGN,
    ].join("\n");
    return { subject, body, present };
  }

  // الحفظ الجديد هذا الأسبوع (بالحدود): من أوّل بداية إلى آخر نهاية.
  const hifz = await db.dailySession.findMany({
    where: { studentId, hifzFromSurah: { not: null }, date: { gte: wkStart, lte: wkEnd } },
    orderBy: { date: "asc" },
    select: { hifzFromSurah: true, hifzFromAyah: true, hifzToSurah: true, hifzToAyah: true },
  });
  let hifzLine = "لا حفظ جديد هذا الأسبوع";
  if (hifz.length) {
    const first = hifz[0], last = hifz[hifz.length - 1];
    hifzLine = `من ${ref(first.hifzFromSurah as number, first.hifzFromAyah ?? 1)} إلى ${ref(last.hifzToSurah as number, last.hifzToAyah ?? 1)}`;
  }

  // الترسيخ: مواضعه (بالحدود).
  const cons = await getConsolidation(studentId, db);
  const tarLine = cons.tarseekh.segments.length
    ? cons.tarseekh.segments.map((s) => `${ref(s.fromSurah, s.fromAyah)}←${ref(s.toSurah, s.toAyah)}`).join("، ")
    : "لا مواضع بعد";

  // المراجعة.
  const wr = await getWeeklyReview(studentId, iso(wkEnd), db);
  const revLine = wr.complete ? "أتمّ دورته الأسبوعية" : `أنجز ${arNum(wr.done)} من ${arNum(wr.required)}`;

  // ملاحظة المعلّم (إن وُجدت): أحدث ملاحظة حضورٍ في الأسبوع.
  const noteRow = await db.attendance.findFirst({
    where: { studentId, date: { gte: wkStart, lte: wkEnd }, note: { not: null } },
    orderBy: { date: "desc" }, select: { note: true },
  });

  const lines = [
    "بسم الله الرحمن الرحيم",
    "السلام عليكم ورحمة الله وبركاته", "",
    `تقرير ابنكم ${name} في حلقة ${circle} لهذا الأسبوع:`, "",
    `• الحضور: حضر ${arNum(present)} من ٥`,
    `• الحفظ الجديد: ${hifzLine}`,
    `• الترسيخ: ${tarLine}`,
    `• المراجعة: ${revLine}`,
  ];
  if (noteRow?.note) lines.push(`• ملاحظة المعلّم: ${noteRow.note}`);
  lines.push("", "نسأل الله أن يجعله من أهل القرآن وخاصّته.", "", SIGN);
  return { subject, body: lines.join("\n"), present };
}

/** يولّد تقارير الأسبوع لكل طالبٍ منتسب، ويمنع التكرار (فريدٌ بالطالب+النوع+الأسبوع). */
export async function generateWeeklyMessages(weekStart: Date, db: PrismaClient = prisma): Promise<number> {
  const wk = toDateOnly(weekStart);
  const enrolled = await db.enrollment.findMany({ where: { endedAt: null }, select: { studentId: true }, distinct: ["studentId"] });
  let created = 0;
  for (const e of enrolled) {
    const exists = await db.guardianMessage.findUnique({ where: { studentId_kind_refDate: { studentId: e.studentId, kind: KIND_WEEKLY, refDate: wk } } });
    if (exists) continue;
    const r = await renderWeeklyReport(e.studentId, wk, db);
    if (!r) continue;
    await db.guardianMessage.create({ data: { studentId: e.studentId, kind: KIND_WEEKLY, refDate: wk, subject: r.subject, body: r.body } });
    created += 1;
  }
  return created;
}

/** تنبيه غيابٍ غير مبرَّر (قرار محمد: غير المبرَّر فقط) — فوريّ، بمنعِ تكرارٍ لليوم. */
export async function notifyAbsence(studentId: string, dateISO: string, db: PrismaClient = prisma): Promise<boolean> {
  const day = toDateOnly(dateISO);
  const exists = await db.guardianMessage.findUnique({ where: { studentId_kind_refDate: { studentId, kind: KIND_ABSENCE, refDate: day } } });
  if (exists) return false;
  const student = await db.student.findUnique({ where: { id: studentId }, select: { user: { select: { nameAsInId: true } } } });
  const name = student?.user.nameAsInId ?? "ابنكم";
  const body = [
    "السلام عليكم ورحمة الله وبركاته", "",
    `لاحظنا غياب ${name} عن حلقة اليوم. نطمئنّ عليه، ونرجو أن يكون بخير.`,
    "إن كان من عائقٍ نُعينكم عليه فأخبرونا، بارك الله فيكم.", "",
    SIGN,
  ].join("\n");
  await db.guardianMessage.create({ data: { studentId, kind: KIND_ABSENCE, refDate: day, subject: `غياب اليوم — ${name}`, body } });
  return true;
}

export interface InboxMessage { id: string; studentName: string; kind: string; subject: string; body: string; createdAt: string; read: boolean }

/** صندوق وليّ الأمر: رسائل طلابه المرتبطين به فقط (لا يرى غيرهم). */
export async function getGuardianInbox(userId: string, db: PrismaClient = prisma): Promise<InboxMessage[]> {
  const links = await db.guardianLink.findMany({ where: { guardianId: userId, status: "ACTIVE" }, select: { studentId: true } });
  const ids = links.map((l) => l.studentId);
  if (ids.length === 0) return [];
  const rows = await db.guardianMessage.findMany({ where: { studentId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 50 });
  const names = new Map<string, string>();
  for (const s of await db.student.findMany({ where: { id: { in: ids } }, select: { id: true, user: { select: { nameAsInId: true } } } })) names.set(s.id, s.user.nameAsInId);
  return rows.map((m) => ({ id: m.id, studentName: names.get(m.studentId) ?? "—", kind: m.kind, subject: m.subject, body: m.body, createdAt: m.createdAt.toISOString(), read: m.readAt != null }));
}

/** تعليمُ رسالةٍ مقروءة — بعد التحقّق أنّها لطالبٍ مرتبطٍ بهذا الوليّ. */
export async function markMessageRead(messageId: string, userId: string, db: PrismaClient = prisma): Promise<void> {
  const msg = await db.guardianMessage.findUnique({ where: { id: messageId }, select: { studentId: true } });
  if (!msg) return;
  const link = await db.guardianLink.findFirst({ where: { guardianId: userId, studentId: msg.studentId, status: "ACTIVE" }, select: { id: true } });
  if (!link) return;
  await db.guardianMessage.update({ where: { id: messageId }, data: { readAt: new Date() } });
}
