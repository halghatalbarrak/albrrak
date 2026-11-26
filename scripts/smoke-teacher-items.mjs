// فحص دخان (smoke): يتحقّق أن الإنتاج فيه بنود TEACHER نشطة.
// يشتغل بعد كل دمجٍ على main — يفشل إن لم تُنشأ البنود.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const count = await prisma.pointItem.count({ where: { active: true, grantSource: "TEACHER" } });
console.log(`TEACHER items active: ${count}`);
await prisma.$disconnect();

if (count === 0) {
  console.error("❌ لا بنود TEACHER نشطة في الإنتاج — شغّل economy-setup (APPLY) أوّلاً.");
  process.exit(1);
}
console.log("✅ بنود TEACHER موجودة — الإنتاج جاهز.");
