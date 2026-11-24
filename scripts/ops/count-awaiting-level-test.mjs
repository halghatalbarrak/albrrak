// قراءةٌ فقط: حصر الطلاب النشطين الذين ينتظرون اختبار تحديد المستوى (AWAITING_READING_TEST) بكل حلقة.
// لا تغيير في البيانات — للتشخيص فقط.
// ⚠️ لا أسماء ولا بيانات شخصية في المخرجات — أعداد وأجزاء أوّلى من المعرّفات فقط.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** يُخفي المعرّف: يُبقي أوّل ٨ أحرف فقط. */
const maskId = (id) => `${id.slice(0, 8)}…`;

async function main() {
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
      student: { select: { id: true } },
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
    if (!byCircle.has(key)) byCircle.set(key, { name, ids: [] });
    byCircle.get(key).ids.push(maskId(r.student.id));
  }

  console.log(`\n📋 AWAITING_READING_TEST — الإجمالي: ${rows.length}\n`);
  console.log("─".repeat(50));

  for (const [, { name, ids }] of byCircle) {
    console.log(`\nالحلقة: ${name}  (${ids.length} طالب)`);
    for (const id of ids) {
      console.log(`  • ${id}`);
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log(`الإجمالي: ${rows.length} طالب في ${byCircle.size} حلقة`);
  console.log(`\nملاحظة: معرّفات مقتطعة (٨ أحرف) فقط — لا أسماء في سجلات CI.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
