// إصلاح طلاب AWAITING_PACE_TEST: تحديد الجبهة وتعيين المسار وترقيتهم إلى IN_MARAQI.
// لا أسماء ولا بيانات شخصيّة — معرّفات مقتطعة (أوّل 8 أحرف) فقط.
// الاستخدام:
//   node scripts/ops/fix-pace-test-students.mjs          (dry-run افتراضياً)
//   MODE=apply node scripts/ops/fix-pace-test-students.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MODE = process.env.MODE ?? "dry-run";

// جدول تحديد المسار بحسب الجبهة (رقم السورة):
// سورة ≥ 78 → ordinal 1 (المسار الأخفّ — النصف الأخير)
// سورة ≥ 58 → ordinal 2
// سورة ≥ 46 → ordinal 3
// سورة ≥ 29 → ordinal 4
// أدنى   → ordinal 5 (المسار الأثقل — البقرة)
function targetOrdinalFromSurah(surah) {
  if (surah >= 78) return 1;
  if (surah >= 58) return 2;
  if (surah >= 46) return 3;
  if (surah >= 29) return 4;
  return 5;
}

async function main() {
  // جلب جميع طلاب AWAITING_PACE_TEST (غير محذوفين)
  const students = await prisma.student.findMany({
    where: { state: "AWAITING_PACE_TEST", deletedAt: null },
    select: {
      id: true,
      enrollments: {
        where: { endedAt: null },
        select: {
          circle: { select: { id: true, nameAr: true } },
        },
      },
      maraqiPlacements: {
        where: { studentId: { not: undefined } },
        select: { reachedSurah: true, reachedAyah: true },
      },
      sessions: {
        where: { hifzToSurah: { not: null } },
        orderBy: { hifzToSurah: "desc" },
        take: 1,
        select: { hifzToSurah: true },
      },
      trackAssignments: {
        where: { endedAt: null },
        select: { id: true, trackId: true },
      },
    },
  });

  // تجميع الطلاب حسب الحلقة
  const byCircle = new Map(); // circleId → { nameAr, students[] }
  const noCircle = [];

  for (const s of students) {
    const activeEnrollment = s.enrollments[0];
    if (activeEnrollment?.circle) {
      const cid = activeEnrollment.circle.id;
      if (!byCircle.has(cid)) {
        byCircle.set(cid, { nameAr: activeEnrollment.circle.nameAr, students: [] });
      }
      byCircle.get(cid).students.push(s);
    } else {
      noCircle.push(s);
    }
  }

  // حساب hasFrontier لكل طالب
  function hasFrontier(s) {
    const hasPlacement =
      s.maraqiPlacements.length > 0 &&
      (s.maraqiPlacements[0].reachedSurah !== null ||
        s.maraqiPlacements[0].reachedAyah !== null);
    const hasSession = s.sessions.length > 0;
    return hasPlacement || hasSession;
  }

  function hasTrack(s) {
    return s.trackAssignments.length > 0;
  }

  // ─── dry-run ───
  if (MODE !== "apply") {
    console.log("📊 dry-run: تقرير AWAITING_PACE_TEST");
    console.log(`إجماليّ AWAITING_PACE_TEST: ${students.length}`);
    console.log("─────────");

    let totalFrontier = 0;
    let totalNoFrontier = 0;

    for (const [cid, data] of byCircle.entries()) {
      const circleStudents = data.students;
      const withFrontier = circleStudents.filter((s) => hasFrontier(s)).length;
      const withoutFrontier = circleStudents.filter((s) => !hasFrontier(s)).length;
      const withTrack = circleStudents.filter((s) => hasTrack(s)).length;

      console.log(`حلقة [${cid.slice(0, 8)}…] — ${circleStudents.length} طالب`);
      console.log(`  له جبهة (maraqiPlacement أو DailySession): ${withFrontier}`);
      console.log(`  بلا جبهة: ${withoutFrontier}`);
      console.log(`  له مسار: ${withTrack}`);

      totalFrontier += withFrontier;
      totalNoFrontier += withoutFrontier;
    }

    if (noCircle.length > 0) {
      const withFrontier = noCircle.filter((s) => hasFrontier(s)).length;
      const withoutFrontier = noCircle.filter((s) => !hasFrontier(s)).length;
      const withTrack = noCircle.filter((s) => hasTrack(s)).length;
      console.log(`حلقة [بلا حلقة] — ${noCircle.length} طالب`);
      console.log(`  له جبهة (maraqiPlacement أو DailySession): ${withFrontier}`);
      console.log(`  بلا جبهة: ${withoutFrontier}`);
      console.log(`  له مسار: ${withTrack}`);
      totalFrontier += withFrontier;
      totalNoFrontier += withoutFrontier;
    }

    console.log("─────────");
    console.log(
      `إجماليّ: له جبهة=${totalFrontier} بلا جبهة=${totalNoFrontier}`
    );
    console.log(
      "⚠️ dry-run — لا تغيير. شغّل بـ MODE=apply للتطبيق."
    );
    return;
  }

  // ─── apply ───
  console.log("🔄 apply: تطبيق IN_MARAQI على طلاب AWAITING_PACE_TEST ذوي الجبهة");

  for (const s of students) {
    const id8 = s.id.slice(0, 8);

    if (!hasFrontier(s)) {
      console.log(`⚠️ [${id8}…] — بلا جبهة، يحتاج متابعة`);
      continue;
    }

    // تحديد رقم السورة الأعلى (الجبهة)
    let frontierSurah = 0;
    if (
      s.maraqiPlacements.length > 0 &&
      s.maraqiPlacements[0].reachedSurah !== null
    ) {
      frontierSurah = Math.max(frontierSurah, s.maraqiPlacements[0].reachedSurah);
    }
    if (s.sessions.length > 0 && s.sessions[0].hifzToSurah !== null) {
      frontierSurah = Math.max(frontierSurah, s.sessions[0].hifzToSurah);
    }

    const targetOrdinal = targetOrdinalFromSurah(frontierSurah);

    // إيجاد المسار المناسب
    let track = await prisma.track.findFirst({
      where: { ordinal: targetOrdinal, deletedAt: null },
      orderBy: { ordinal: "asc" },
    });
    if (!track) {
      // احتياطي: أيّ مسار نشط
      track = await prisma.track.findFirst({
        where: { deletedAt: null },
        orderBy: { ordinal: "asc" },
      });
    }

    if (!track) {
      console.log(`⚠️ [${id8}…] — لا مسار متاح في قاعدة البيانات، يحتاج متابعة`);
      continue;
    }

    // تنفيذ المعاملة
    await prisma.$transaction([
      // ١. تحديث حالة الطالب
      prisma.student.update({
        where: { id: s.id },
        data: { state: "IN_MARAQI" },
      }),
      // ٢. إغلاق المسار الحاليّ إن وُجد
      prisma.trackAssignment.updateMany({
        where: { studentId: s.id, endedAt: null },
        data: { endedAt: new Date() },
      }),
      // ٣. إنشاء تعيين مسار جديد
      prisma.trackAssignment.create({
        data: {
          studentId: s.id,
          trackId: track.id,
          reason: "AUTO_FROM_FRONTIER",
        },
      }),
      // ٤. سجل التدقيق
      prisma.auditLog.create({
        data: {
          action: "STATE_ADVANCE",
          entity: "Student",
          entityId: s.id,
          actorId: "system-pace-test-removal",
          label: JSON.stringify({
            from: "AWAITING_PACE_TEST",
            to: "IN_MARAQI",
            source: "AUTO_FROM_FRONTIER",
          }),
        },
      }),
    ]);

    console.log(`✅ [${id8}…] → IN_MARAQI مسار:#${track.ordinal}`);
  }

  console.log("✔ اكتملت العملية.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
