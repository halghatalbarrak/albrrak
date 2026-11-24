// قراءةٌ فقط: حصر الطلاب النشطين الذين ينتظرون اختبار تحديد المستوى (AWAITING_READING_TEST) بكل حلقة.
// لا تغيير في البيانات — للتشخيص فقط.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // حصر الطلاب النشطين (قيدٌ نشط = endedAt null) في حالة AWAITING_READING_TEST
  const rows = await prisma.enrollment.findMany({
    where: {
      endedAt: null,
      student: {
        deletedAt: null,
        state: "AWAITING_READING_TEST",
      },
    },
    select: {
      circleId: true,
      circle: { select: { nameAr: true } },
      student: {
        select: {
          id: true,
          user: { select: { name: true } },
        },
      },
    },
    orderBy: [{ circleId: "asc" }],
  });

  if (rows.length === 0) {
    console.log("\n✅ لا طلاب ينتظرون اختبار المستوى.\n");
    return;
  }

  // تجميع بالحلقة
  const byCircle = new Map();
  for (const r of rows) {
    const key = r.circleId ?? "(بلا حلقة)";
    const name = r.circle?.nameAr ?? "(بلا حلقة)";
    if (!byCircle.has(key)) byCircle.set(key, { name, students: [] });
    byCircle.get(key).students.push(r.student.user.name);
  }

  console.log(`\n📋 الطلاب المنتظرون اختبار تحديد المستوى — الإجمالي: ${rows.length}\n`);
  console.log("─".repeat(50));

  for (const [, { name, students }] of byCircle) {
    console.log(`\nالحلقة: ${name}  (${students.length} طالب)`);
    for (const n of students) {
      console.log(`  • ${n}`);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(`الإجمالي: ${rows.length} طالب في ${byCircle.size} حلقة`);
  console.log(`\nملاحظة: لا حقل «مستورد» في قاعدة البيانات — لا يمكن تمييز المستوردين برمجياً.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
