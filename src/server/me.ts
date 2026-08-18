import { ProgramKey, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import { getStudentPosition, getHifzGate } from "./daily-session";
import { getConsolidation, getWeeklyReview } from "./tarseekh";

// صفحة المستخدم عن نفسه — بلا رقم هوية، بلا بيانات غيره.
export interface MyPage {
  userId: string;
  name: string;
  roles: string[];
  student: { id: string; state: string } | null;
}

export async function getMyPage(
  userId: string,
  db: PrismaClient = prisma,
): Promise<MyPage> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      nameAsInId: true,
      roles: true,
      student: { select: { id: true, state: true } },
    },
  });
  return {
    userId: user.id,
    name: user.nameAsInId,
    roles: user.roles,
    student: user.student
      ? { id: user.student.id, state: user.student.state }
      : null,
  };
}

// ═══════════════ لوحة الطالب عن نفسه (م٨) ═══════════════
// الطالب يفتح صفحته فيرى حاله فوراً: موضعه (بحدوده، لا برقم حزب — §٨٫٢) · ما رسّخه ·
// ما عليه اليوم · دورة مراجعته، ويقترح النظام: ما يحفظه وما يراجعه. قراءةٌ فقط.

export interface MyStudentSession {
  hasStudent: boolean;
  program: string | null;
  state: string | null;
  started: boolean;
  /** حدود موضعه (كالناس ← الضحى) — بلا رقم حزب (الطالب لا يرى «حزب»، §٨٫٢). */
  positionLabel: string | null;
  /** عدد المقاطع الراسخة (ما رسّخه). */
  raasikhCount: number | null;
  today: { mustRepeat: boolean; repeatRange: string | null; tarseekhCount: number; khums: number } | null;
  weekly: { done: number; required: number; percent: number; complete: boolean } | null;
  suggestions: { memorize: string; review: string } | null;
}

const rangeStr = (r: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }) =>
  `${r.fromSurah}:${r.fromAyah} ← ${r.toSurah}:${r.toAyah}`;

export async function getMyStudentSession(
  userId: string,
  db: PrismaClient = prisma,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<MyStudentSession> {
  const empty: MyStudentSession = {
    hasStudent: false, program: null, state: null, started: false,
    positionLabel: null, raasikhCount: null, today: null, weekly: null, suggestions: null,
  };

  const user = await db.user.findUnique({ where: { id: userId }, select: { student: { select: { id: true, state: true } } } });
  const student = user?.student;
  if (!student) return empty;

  let position;
  try {
    position = await getStudentPosition(student.id, db);
  } catch {
    // غير منتسبٍ لحلقة نشطة — نُظهر حالته فقط.
    return { ...empty, hasStudent: true, state: student.state };
  }

  if (position.program !== ProgramKey.MARAQI) {
    return {
      ...empty, hasStudent: true, program: position.program, state: student.state, started: position.started,
      positionLabel: position.current?.label ?? null,
      suggestions: { memorize: "تابِع القاعدة المدنية مع معلّمك", review: "—" },
    };
  }

  const [cons, weekly, gate] = await Promise.all([
    getConsolidation(student.id, db),
    getWeeklyReview(student.id, today, db),
    getHifzGate(student.id, today, db),
  ]);
  const memorize = gate.mustRepeat && gate.range
    ? `أعِد مقطع أمس مع معلّمك (${rangeStr(gate.range)})`
    : "حفظٌ جديد مع معلّمك";
  const review = cons.review.khums > 0
    ? `راجِع خُمس محفوظك اليوم (≈ ${cons.review.khums} مقاطع)`
    : "لا مراجعة اليوم";

  return {
    hasStudent: true, program: position.program, state: student.state, started: position.started,
    positionLabel: position.current?.label ?? null,
    raasikhCount: cons.review.stockCount,
    today: { mustRepeat: gate.mustRepeat, repeatRange: gate.range ? rangeStr(gate.range) : null, tarseekhCount: cons.tarseekh.segments.length, khums: cons.review.khums },
    weekly: { done: weekly.done, required: weekly.required, percent: weekly.percent, complete: weekly.complete },
    suggestions: { memorize, review },
  };
}
