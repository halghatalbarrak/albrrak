// قراءةٌ فقط: حصر الحسابات التي سيُحجب دخولها بم٤ (عمر < ١٣ + authId)
// وحصر من تاريخ ميلادهم غير مسجَّل (authId موجود + birthDate فارغ).
// لا تغيّر شيئاً — للتقرير فقط.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const now = new Date();
const thirteenYearsAgo = new Date(now);
thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);

try {
  // م٤: authId + birthDate أحدث من ١٣ سنة (عمرهم < ١٣)
  const under13 = await prisma.user.findMany({
    where: { authId: { not: null }, birthDate: { gt: thirteenYearsAgo }, deletedAt: null },
    select: { id: true, nameAsInId: true, birthDate: true },
  });

  // بلا birthDate + authId موجود
  const noBirthDate = await prisma.user.findMany({
    where: { authId: { not: null }, birthDate: null, deletedAt: null },
    select: { id: true },
  });

  console.log(`\n🔒 حسابات ستُحجَب بم٤ (دون ١٣ + authId): ${under13.length}`);
  for (const u of under13) {
    const bd = u.birthDate ? u.birthDate.toISOString().slice(0, 10) : "—";
    console.log(`   - ${u.nameAsInId} (${bd})`);
  }

  console.log(`\n⚠️  حسابات بلا تاريخ ميلاد + authId موجود: ${noBirthDate.length}`);
  console.log(`   (لا تُحجَب — تظهر في admin/under-13 للاستكمال)`);

  console.log(`\nالمجموع المؤثّر (أيٌّ من الحالتين): ${under13.length + noBirthDate.length}`);
} finally {
  await prisma.$disconnect();
}
