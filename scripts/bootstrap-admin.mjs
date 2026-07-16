// تهيئة أوّل مدير — يربط سجلّ User بمستخدم مصادقة أنشأتَه في لوحة Supabase.
// الاستعمال (بعد ضبط DATABASE_URL و DIRECT_URL محليًّا):
//   node scripts/bootstrap-admin.mjs <authId> <phone> "<الاسم>"
// حيث authId = معرّف المستخدم من Supabase → Authentication → Users.
import { PrismaClient } from "@prisma/client";

const [authId, phone, name] = process.argv.slice(2);
if (!authId || !phone || !name) {
  console.error(
    'الاستعمال: node scripts/bootstrap-admin.mjs <authId> <phone> "<الاسم>"',
  );
  process.exit(1);
}

const prisma = new PrismaClient();
const email = `u${phone.replace(/\D/g, "")}@albrrak.app`;
const roles = ["SUPER_ADMIN", "CIRCLE_MANAGER", "REGISTRAR"];

// إن وُجد مديرٌ بالفعل (بمعرّفٍ مختلف) ← توقّف، لا تُنشئ ثانيًا.
// (إعادة التشغيل بنفس authUid آمنة — تحديثٌ لا إنشاء.)
const existingAdmin = await prisma.user.findFirst({
  where: { roles: { has: "SUPER_ADMIN" } },
  select: { id: true, authId: true },
});
if (existingAdmin && existingAdmin.authId !== authId) {
  console.log("مدير موجود بالفعل — لن يُنشأ ثانٍ:", existingAdmin.id);
  await prisma.$disconnect();
  process.exit(0);
}

const user = await prisma.user.upsert({
  where: { authId },
  update: { roles },
  create: { authId, email, phone, nameAsInId: name, gender: "MALE", roles },
});
console.log("المدير جاهز:", { id: user.id, email, roles });
await prisma.$disconnect();
