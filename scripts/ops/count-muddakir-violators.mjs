// أداة قراءةٍ فقط (و١، حصر وظائف المدّكر): تحصر **عدد** من يجمع اليوم وظيفة مدّكرٍ مع غيرها —
// دورٌ عامٌّ في المنصّة، أو وظيفة مدّكرٍ ثانية. لا تغيّر أحداً (النافذة تُظهر «أزل الزائد»).
// تُشغَّل عبر workflow «Muddakir violators (count)» على قاعدة الإنتاج (DATABASE_URL/DIRECT_URL).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const staff = await prisma.muddakirStaff.findMany({ where: { endedAt: null }, select: { userId: true, role: true } });
  const byUser = new Map();
  for (const s of staff) {
    const set = byUser.get(s.userId) ?? new Set();
    set.add(s.role);
    byUser.set(s.userId, set);
  }
  const ids = [...byUser.keys()];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, roles: true } }) : [];
  const rolesById = new Map(users.map((u) => [u.id, u.roles]));

  let violators = 0;
  const lines = [];
  for (const [uid, fns] of byUser) {
    const roles = rolesById.get(uid) ?? [];
    if (roles.length > 0 || fns.size > 1) {
      violators++;
      lines.push(`  ${uid}: أدوارٌ عامّة=[${roles.join(", ")}] · وظائف=[${[...fns].join(", ")}]`);
    }
  }

  console.log(`مخالفو حصر وظائف المدّكر: ${violators}`);
  if (lines.length) console.log(lines.join("\n"));
  else console.log("لا مخالف — كلّ موظّف مدّكرٍ بوظيفةٍ واحدةٍ بلا دورٍ عامّ.");
} finally {
  await prisma.$disconnect();
}
