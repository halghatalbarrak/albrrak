// إصلاح طلاب AWAITING_PACE_TEST: تحديد الجبهة وتعيين المسار وترقيتهم إلى IN_MARAQI.
// لا أسماء ولا بيانات شخصيّة — معرّفات مقتطعة (أوّل 8 أحرف) فقط.
// الاستخدام:
//   npx tsx --tsconfig tsconfig.json scripts/ops/fix-pace-test-students.ts          (dry-run افتراضياً)
//   MODE=apply npx tsx --tsconfig tsconfig.json scripts/ops/fix-pace-test-students.ts
import { PrismaClient } from "@prisma/client";
import { suggestTrackForStudent } from "@/server/student-setup";
import { assignMaraqiTrack } from "@/server/track-assignment";

const prisma = new PrismaClient();
const MODE = process.env.MODE ?? "dry-run";

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
  const byCircle = new Map<string, { nameAr: string; students: typeof students }>(); // circleId → { nameAr, students[] }
  const noCircle: typeof students = [];

  for (const s of students) {
    const activeEnrollment = s.enrollments[0];
    if (activeEnrollment?.circle) {
      const cid = activeEnrollment.circle.id;
      if (!byCircle.has(cid)) {
        byCircle.set(cid, { nameAr: activeEnrollment.circle.nameAr, students: [] });
      }
      byCircle.get(cid)!.students.push(s);
    } else {
      noCircle.push(s);
    }
  }

  // حساب hasFrontier لكل طالب
  function hasFrontier(s: typeof students[number]) {
    const hasPlacement =
      s.maraqiPlacements.length > 0 &&
      (s.maraqiPlacements[0].reachedSurah !== null ||
        s.maraqiPlacements[0].reachedAyah !== null);
    const hasSession = s.sessions.length > 0;
    return hasPlacement || hasSession;
  }

  function hasTrack(s: typeof students[number]) {
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

    const suggestion = await suggestTrackForStudent(s.id, prisma);
    if (!suggestion.suggestedTrackId) {
      console.log(`⚠️ [${id8}…] — لا مسار مقترح، يحتاج متابعة`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: s.id }, data: { state: "IN_MARAQI" } });
      await assignMaraqiTrack(
        {
          studentId: s.id,
          trackId: suggestion.suggestedTrackId!,
          source: "AUTO_FROM_FRONTIER",
          actorId: "system-pace-test-removal",
          _skipAuth: true,
        },
        prisma,
      );
      await tx.auditLog.create({
        data: {
          action: "STATE_ADVANCE",
          entity: "Student",
          entityId: s.id,
          actorId: "system-pace-test-removal",
          label: JSON.stringify({ from: "AWAITING_PACE_TEST", to: "IN_MARAQI", source: "AUTO_FROM_FRONTIER" }),
        },
      });
    });

    const trackOrdinal = suggestion.availableTracks.find((t) => t.id === suggestion.suggestedTrackId!)?.ordinal ?? "?";
    console.log(`✅ [${id8}…] → IN_MARAQI مسار:#${trackOrdinal}`);
  }

  console.log("✔ اكتملت العملية.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
