import { Role, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getFace } from "./mushaf";
import { AuthorizationError } from "./errors";

// خريطة ضعف الطالب (الفكرة ١): تظليل أوجه المصحف بتدرّجٍ بحسب أخطاء الحصاد المسجَّلة عند
// الآيات. المصدر (المرحلة الأولى): HasadPageError وحده (دقيقٌ على الآية). التاريخ الكامل
// (لا يُصفَّر بالترميم). العتبات ثابتة. تفاصيل القرار في MARAQI_RULES.md «خريطة الضعف».

// ── الدالّة النقيّة (قابلة لإعادة الاستعمال في الفكرة ٣) ──

export interface RawAyahError { pageNo: number; surah: number; ayah: number }
export interface AyahTally { pageNo: number; surah: number; ayah: number; count: number }

/** يجمع الأخطاء بعددها لكل آية (surah:ayah). نقيّةٌ بلا قاعدة بيانات — مرتّبةٌ للثبات. */
export function tallyAyahErrors(errors: RawAyahError[]): AyahTally[] {
  const map = new Map<string, AyahTally>();
  for (const e of errors) {
    const key = `${e.surah}:${e.ayah}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else map.set(key, { pageNo: e.pageNo, surah: e.surah, ayah: e.ayah, count: 1 });
  }
  return [...map.values()].sort((a, b) => (b.count - a.count) || (a.surah - b.surah) || (a.ayah - b.ayah));
}

/** العتبات الثابتة (قرار محمد): ١ خطأ ⟵ ١ · ٢ ⟵ ٢ · ٣ فأكثر ⟵ ٣. لا نسبيّة، لا صفر. */
export function weaknessLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return 3;
}

/** مجموع أخطاء نطاقٍ من الآيات (للفكرة ٣: ترتيب المقاطع بالأضعف). نقيّة. */
export function rangeWeakness(
  tally: AyahTally[],
  from: { surah: number; ayah: number },
  to: { surah: number; ayah: number },
): number {
  const ge = (s: number, a: number) => s > from.surah || (s === from.surah && a >= from.ayah);
  const le = (s: number, a: number) => s < to.surah || (s === to.surah && a <= to.ayah);
  return tally.filter((t) => ge(t.surah, t.ayah) && le(t.surah, t.ayah)).reduce((sum, t) => sum + t.count, 0);
}

// ── جلب الخريطة من القاعدة ──

export interface WeaknessAyah { surah: number; ayah: number; count: number; level: 0 | 1 | 2 | 3 }
export interface WeaknessFace {
  pageNo: number;
  imageUrl: string;
  polygonsUrl: string;
  viewBox: { width: number; height: number };
  ayahs: WeaknessAyah[];
}
export interface WeaknessMap {
  studentName: string;
  faces: WeaknessFace[];
  totalErrors: number;
  weakestAyahs: WeaknessAyah[]; // الأكثر خطأً (للمعلّم) — مرتّبةً تنازليًّا
}

/**
 * خريطة ضعف طالبٍ من أخطاء حصاده كاملةً (لا تُصفَّر بالترميم). عرضٌ للقراءة فقط.
 * الحرّاس (من يرى خريطة من) في طبقة المسار، لا هنا.
 */
export async function getStudentWeaknessMap(studentId: string, db: PrismaClient = prisma): Promise<WeaknessMap> {
  const s = await db.student.findUnique({ where: { id: studentId }, select: { user: { select: { nameAsInId: true } } } });
  const rows = await db.hasadPageError.findMany({
    where: { hasad: { studentId }, surah: { not: null }, ayah: { not: null } },
    select: { pageNo: true, surah: true, ayah: true },
  });
  const tally = tallyAyahErrors(rows.map((r) => ({ pageNo: r.pageNo, surah: r.surah as number, ayah: r.ayah as number })));

  const pages = [...new Set(tally.map((t) => t.pageNo))].sort((a, b) => a - b);
  const faces: WeaknessFace[] = [];
  for (const page of pages) {
    const f = await getFace(page, db);
    const ayahs = tally
      .filter((t) => t.pageNo === page)
      .map((t) => ({ surah: t.surah, ayah: t.ayah, count: t.count, level: weaknessLevel(t.count) }));
    faces.push({ pageNo: page, imageUrl: f.imageUrl, polygonsUrl: f.polygonsUrl, viewBox: f.polygonViewBox, ayahs });
  }

  return {
    studentName: s?.user.nameAsInId ?? "",
    faces,
    totalErrors: tally.reduce((sum, t) => sum + t.count, 0),
    weakestAyahs: tally.map((t) => ({ surah: t.surah, ayah: t.ayah, count: t.count, level: weaknessLevel(t.count) })),
  };
}

/** خريطة المستخدم عن نفسه فقط — المعرّف من هويّته لا من المسار (لا يرى غيره). */
export async function getMyWeaknessMap(userId: string, db: PrismaClient = prisma): Promise<WeaknessMap> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { student: { select: { id: true } } } });
  if (!user?.student) return { studentName: "", faces: [], totalErrors: 0, weakestAyahs: [] };
  return getStudentWeaknessMap(user.student.id, db);
}

// ═══════════════ خريطة ضعف الحلقة (الفكرة ٢) ═══════════════
// تجميع أخطاء طلاب الحلقة على الآيات نفسها. الشدّة = **عدد الطلاب** المتعثّرين في الآية
// (لا مجموع الأخطاء) — فآيةٌ يتعثّر فيها عدّةٌ = خللٌ في التلقين يُعلَّم جماعةً. لا يراها طالب.

export interface StudentAyahError { studentId: string; pageNo: number; surah: number; ayah: number }

/** يعدّ الطلاب المتمايزين المتعثّرين في كل آية (distinct) — للخريطة الجمعيّة. نقيّة. */
export function tallyAyahStudentCounts(entries: StudentAyahError[]): AyahTally[] {
  const perAyah = new Map<string, { pageNo: number; surah: number; ayah: number; students: Set<string> }>();
  for (const e of entries) {
    const key = `${e.surah}:${e.ayah}`;
    const cur = perAyah.get(key);
    if (cur) cur.students.add(e.studentId);
    else perAyah.set(key, { pageNo: e.pageNo, surah: e.surah, ayah: e.ayah, students: new Set([e.studentId]) });
  }
  return [...perAyah.values()]
    .map((v) => ({ pageNo: v.pageNo, surah: v.surah, ayah: v.ayah, count: v.students.size }))
    .sort((a, b) => (b.count - a.count) || (a.surah - b.surah) || (a.ayah - b.ayah));
}

export interface CircleWeaknessMap {
  circleName: string;
  studentCount: number;
  faces: WeaknessFace[];
  weakestAyahs: WeaknessAyah[]; // count = عدد الطلاب المتعثّرين
}

/** خريطة ضعف حلقةٍ: لكل آيةٍ عددُ طلابها المتعثّرين فيها، بنفس العتبات البرونزيّة. */
export async function getCircleWeaknessMap(circleId: string, db: PrismaClient = prisma): Promise<CircleWeaknessMap> {
  const circle = await db.circle.findUnique({
    where: { id: circleId },
    select: { nameAr: true, enrollments: { where: { endedAt: null }, select: { studentId: true } } },
  });
  const studentIds = circle?.enrollments.map((e) => e.studentId) ?? [];

  const rows = await db.hasadPageError.findMany({
    where: { hasad: { studentId: { in: studentIds } }, surah: { not: null }, ayah: { not: null } },
    select: { pageNo: true, surah: true, ayah: true, hasad: { select: { studentId: true } } },
  });
  const tally = tallyAyahStudentCounts(rows.map((r) => ({ studentId: r.hasad.studentId, pageNo: r.pageNo, surah: r.surah as number, ayah: r.ayah as number })));

  const pages = [...new Set(tally.map((t) => t.pageNo))].sort((a, b) => a - b);
  const faces: WeaknessFace[] = [];
  for (const page of pages) {
    const f = await getFace(page, db);
    const ayahs = tally.filter((t) => t.pageNo === page).map((t) => ({ surah: t.surah, ayah: t.ayah, count: t.count, level: weaknessLevel(t.count) }));
    faces.push({ pageNo: page, imageUrl: f.imageUrl, polygonsUrl: f.polygonsUrl, viewBox: f.polygonViewBox, ayahs });
  }

  return {
    circleName: circle?.nameAr ?? "",
    studentCount: studentIds.length,
    faces,
    weakestAyahs: tally.map((t) => ({ surah: t.surah, ayah: t.ayah, count: t.count, level: weaknessLevel(t.count) })),
  };
}

/** حارس الوصول للحلقة: المدير/المشرف أيّ حلقة، والمعلّم حلقته فقط. */
export async function assertCircleAccess(actorId: string, circleId: string, db: PrismaClient = prisma): Promise<void> {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (actor.roles.some((r) => r === Role.SUPER_ADMIN || r === Role.CIRCLE_MANAGER)) return;
  const link = await db.circleTeacher.findFirst({ where: { circleId, teacherId: actorId, endedAt: null }, select: { circleId: true } });
  if (!link) throw new AuthorizationError("لا تَرى إلا خريطة حلقتك.");
}
