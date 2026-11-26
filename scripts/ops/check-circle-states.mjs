// قراءةٌ فقط: فحص حالة طلاب حلقة بالاسم (للتشخيص).
// لا أسماء ولا بيانات شخصيّة — حالات + معرّفات مقتطعة (أوّل 8 أحرف).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// يُمرَّر اسم الحلقة كـargument، أو يستخدم "أبي بكر" افتراضياً
const searchName = process.argv[2] ?? "أبي بكر";

async function main() {
  const circles = await prisma.circle.findMany({
    where: { nameAr: { contains: searchName }, deletedAt: null },
    select: {
      id: true,
      nameAr: true,
      enrollments: {
        where: { endedAt: null, student: { deletedAt: null } },
        select: {
          student: {
            select: {
              id: true,
              state: true,
              trackAssignments: {
                where: { endedAt: null },
                select: { track: { select: { ordinal: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!circles.length) {
    console.log(`لا حلقة تحتوي "${searchName}"`);
    return;
  }

  for (const circle of circles) {
    const students = circle.enrollments.map((e) => e.student);
    console.log(`\n📋 حلقة: [${circle.id.slice(0, 8)}…] — ${students.length} طالب\n`);

    // إحصاء الحالات
    const stateCounts = new Map();
    for (const s of students) {
      stateCounts.set(s.state, (stateCounts.get(s.state) ?? 0) + 1);
    }
    console.log("توزيع الحالات:");
    for (const [state, count] of [...stateCounts.entries()].sort()) {
      console.log(`  ${state.padEnd(28)} : ${count}`);
    }

    // جدول أوّل ٥ طلاب
    console.log("\nأوّل ٥ طلاب (معرّف مقتطع — حالة — مسار):");
    for (const s of students.slice(0, 5)) {
      const sid = s.id.slice(0, 8);
      const trackOrdinal = s.trackAssignments[0]?.track?.ordinal ?? null;
      console.log(`  ${sid}…  state:${s.state}  track:${trackOrdinal !== null ? `#${trackOrdinal}` : "—"}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
