import { AttendanceStatus, AutoEventType, ProgramKey, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { defaultStatusFor, toDateOnly } from "./attendance";
import { assertCanRecordListening } from "./daily-session";
import { grantAuto } from "./economy";
import { getQaidahPosition, qaidahBoardRow, type QaidahBoardStudent } from "./qaidah-session";
import { nextUnitForStudent } from "./track-units";
import { sessionBoardWithTarget, type BoardStudentWithTarget } from "./today-target";

// ═══════════════ الشاشة الموحّدة (م ج) — لوحةٌ واحدة + الزيادة ═══════════════
//
// طبقة عرضٍ وتسجيلٍ فوق المحرّكات القائمة (todayTarget/grantAuto/الحضور/محرّك العذر) — لا
// تكرّر منطقًا. getUnifiedBoard يجمع لوحة الجلسة+الوجهة مع حالة حضور كل طالب. recordExtra
// يكافئ الإنجاز الزائد بالوحدة التالية (nextUnitForStudent) ويُطلق *_EXTRA بمرجع الوحدة.

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const EXTRA_EVENT: Record<"hifz" | "tarseekh" | "murajaah", AutoEventType> = {
  hifz: AutoEventType.HIFZ_EXTRA,
  tarseekh: AutoEventType.TARSEEKH_EXTRA,
  murajaah: AutoEventType.MURAJAAH_EXTRA,
};

export interface UnifiedStudent extends BoardStudentWithTarget {
  /** حالة الحضور المسجَّلة اليوم، أو null إن لم تُرفَع بعد (يُبيّن «من بقي»). */
  attendanceStatus: AttendanceStatus | null;
  /** كتلة القاعدة المدنية (م ج): الباب + الدرس الحاليّ + النسبة + تقييم اليوم + العدّاد + القفل.
   *  null لغير طلاب القاعدة (لمراقي تُستعمل today). البرنامج نفسه في `program` الموروث (ق١، من القيد). */
  qaidah: QaidahBoardStudent | null;
}

export interface UnifiedBoard {
  circle: { id: string; nameAr: string } | null;
  /** برنامج الحلقة الافتراضيّ (للترويسة). في حلقةٍ مختلطة يُعتمَد برنامج كلّ طالبٍ من student.program. */
  program: ProgramKey | null;
  students: UnifiedStudent[];
  /** هل الأصل «غياب» لهذا اليوم؟ (§ م ج: من العتبة فصاعدًا) — تُبيّنه الواجهة لمن لم يُرفَع. */
  absentDefault: boolean;
}

/**
 * لوحة الحلقة الموحّدة: كل طالبٍ **بلوحة برنامجه هو** (ق١) — مراقي وجهةَ يومه، والقاعدة درسَه
 * الحاليّ — ولو كانت الحلقة مختلطة البرامج. البرنامج يُقرأ من قيد كلّ طالب لا من الحلقة.
 */
export async function getUnifiedBoard(
  actorId: string,
  circleId: string,
  date: string | Date,
  db: PrismaClient = prisma,
): Promise<UnifiedBoard> {
  const board = await sessionBoardWithTarget(actorId, circleId, date, db);
  const rows = await db.attendance.findMany({
    where: { circleId, date: toDateOnly(date) },
    select: { studentId: true, status: true },
  });
  const statusBy = new Map(rows.map((r) => [r.studentId, r.status]));

  // برنامج كلّ طالبٍ محسوبٌ مسبقًا في s.program (getStudentPosition ⟵ activeCircle ⟵ القيد، ق١).
  const students: UnifiedStudent[] = [];
  for (const s of board.students) {
    const qaidah = s.program === ProgramKey.QAIDAH_MADANIYYAH
      ? qaidahBoardRow(s.studentId, s.name, await getQaidahPosition(s.studentId, db, date))
      : null;
    students.push({ ...s, attendanceStatus: statusBy.get(s.studentId) ?? null, qaidah });
  }

  // ترويسة اللوحة: برنامج الحلقة الافتراضيّ (الواجهة تعتمد student.program لكلّ صفّ).
  const circle = await db.circle.findUnique({ where: { id: circleId }, select: { program: { select: { key: true } } } });

  return {
    circle: board.circle,
    program: circle?.program.key ?? null,
    students,
    absentDefault: defaultStatusFor(date) === AttendanceStatus.ABSENT_UNEXCUSED,
  };
}

export interface ExtraArgs {
  studentId: string;
  actorId: string;
  kind: "hifz" | "tarseekh" | "murajaah";
  date: string | Date;
}

export interface ExtraResult {
  unit: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null;
}

/**
 * مكافأة الإنجاز الزائد (م ج): يقترح الوحدة التالية في مسار الطالب ويُطلق *_EXTRA بمرجعها
 * (منع ازدواجٍ لكلّ وحدةٍ في اليوم). لا وحدةَ تالية (أتمّ/لا مسار) ⟵ لا زيادة. يفوّض معلّم
 * الحلقة/العريف المُسنَد (كنمط التسميع). لا يمسّ موضع الطالب — مكافأةٌ فقط.
 */
export async function recordExtra(args: ExtraArgs, db: PrismaClient = prisma): Promise<ExtraResult> {
  await assertCanRecordListening(args.actorId, args.studentId, db);
  const next = await nextUnitForStudent(args.studentId, db);
  if (!next) return { unit: null };
  const dk = dayKey(toDateOnly(args.date));
  const sourceRef = `${dk}:${next.startSurah}:${next.startAyah}`;
  await grantAuto(db, EXTRA_EVENT[args.kind], args.studentId, sourceRef);
  return { unit: { fromSurah: next.startSurah, fromAyah: next.startAyah, toSurah: next.endSurah, toAyah: next.endAyah } };
}
