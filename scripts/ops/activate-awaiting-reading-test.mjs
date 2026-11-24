/**
 * تفعيل الطلاب المنتظرين اختبار القراءة (AWAITING_READING_TEST → IN_MARAQI).
 * لا تغيير بدون confirm=APPLY — الافتراضي dry-run.
 *
 * ⚠️ لا أسماء في المخرجات — معرّفات مقتطعة وأسماء حلقات فقط.
 *
 * الاستخدام:
 *   CONFIRM=     node scripts/ops/activate-awaiting-reading-test.mjs  ← dry-run
 *   CONFIRM=APPLY node scripts/ops/activate-awaiting-reading-test.mjs ← تنفيذ
 */
import { PrismaClient, StudentState, ProgramKey } from "@prisma/client";

const prisma = new PrismaClient();
const DRY_RUN = process.env.CONFIRM !== "APPLY";
const maskId = (id) => `${id.slice(0, 8)}…`;

async function main() {
  if (DRY_RUN) {
    console.log("\n🔍 DRY-RUN — لا تغيير في البيانات (مرِّر CONFIRM=APPLY للتنفيذ)\n");
  } else {
    console.log("\n🚀 APPLY — تنفيذ التفعيل الفعليّ\n");
  }

  // جلب كل الطلاب المنتظرين
  const rows = await prisma.enrollment.findMany({
    where: {
      endedAt: null,
      student: {
        deletedAt: null,
        state: StudentState.AWAITING_READING_TEST,
      },
    },
    select: {
      circleId: true,
      circle: { select: { nameAr: true } },
      student: {
        select: {
          id: true,
          enrollments: {
            where: { endedAt: null },
            select: { program: { select: { key: true } } },
            take: 1,
            orderBy: { startedAt: "desc" },
          },
        },
      },
    },
    orderBy: [{ circleId: "asc" }],
  });

  if (rows.length === 0) {
    console.log("✅ لا طلاب ينتظرون اختبار القراءة.\n");
    return;
  }

  // جلب التسكين (MaraqiPlacement) لكل الطلاب دفعةً واحدة
  const studentIds = rows.map((r) => r.student.id);
  const placements = await prisma.maraqiPlacement.findMany({
    where: { studentId: { in: studentIds } },
    select: { studentId: true, reachedSurah: true, reachedAyah: true },
  });
  const hasPlacement = new Set(placements.map((p) => p.studentId));

  // طباعة جدول القرار
  console.log("─".repeat(60));
  console.log(`${"معرّف".padEnd(12)} ${"الحلقة".padEnd(20)} ${"البرنامج".padEnd(10)} ${"القرار"}`);
  console.log("─".repeat(60));

  const toActivate = [];
  const noPlacement = [];

  for (const r of rows) {
    const sid = r.student.id;
    const circle = r.circle?.nameAr ?? "(بلا حلقة)";
    const progKey = r.student.enrollments[0]?.program?.key ?? "(غير محدّد)";
    const isMaraqi = progKey === ProgramKey.MARAQI;

    if (!isMaraqi) {
      console.log(`${maskId(sid).padEnd(12)} ${circle.padEnd(20)} ${progKey.padEnd(10)} ⚠️  غير مراقي — يُتجاهل`);
      continue;
    }

    if (!hasPlacement.has(sid)) {
      console.log(`${maskId(sid).padEnd(12)} ${circle.padEnd(20)} ${progKey.padEnd(10)} ❌ الموضع غير محدّد`);
      noPlacement.push({ sid, circle });
      continue;
    }

    console.log(`${maskId(sid).padEnd(12)} ${circle.padEnd(20)} ${progKey.padEnd(10)} ✅ سيُفعَّل → IN_MARAQI`);
    toActivate.push({ sid, circle });
  }

  console.log("─".repeat(60));
  console.log(`\nالملخّص: ${toActivate.length} سيُفعَّل، ${noPlacement.length} موضعٌ غير محدّد\n`);

  if (noPlacement.length > 0) {
    console.log("⚠️  من لا موضع له — يحتاج تسكيناً يدويّاً قبل التفعيل:");
    for (const { sid, circle } of noPlacement) {
      console.log(`  • ${maskId(sid)} — ${circle}`);
    }
    console.log();
  }

  if (DRY_RUN) {
    console.log("⏸  dry-run انتهى. أعد التشغيل بـ CONFIRM=APPLY للتنفيذ.\n");
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────
  if (toActivate.length === 0) {
    console.log("لا شيء يُفعَّل (جميعهم بلا موضع).\n");
    return;
  }

  let activated = 0;
  for (const { sid } of toActivate) {
    await prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: sid },
        data: { state: StudentState.IN_MARAQI },
      });
      await tx.auditLog.create({
        data: {
          actorId: "SYSTEM",
          action: "ACTIVATE_FROM_READING_TEST",
          entity: "Student",
          entityId: sid,
          label: "batch-activate-sec4 via workflow",
        },
      });
    });
    activated++;
    console.log(`  ✓ فُعِّل: ${maskId(sid)}`);
  }

  console.log(`\n🎉 اكتمل التفعيل: ${activated} طالب → IN_MARAQI\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
