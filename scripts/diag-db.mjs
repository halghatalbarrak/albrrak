// تشخيص قراءةٍ فقط (مؤقّت): عدّ صيغ الجوال المخزّنة، وهل الرقم المُبلَّغ عنه مسجَّل. أعدادٌ فقط، بلا بيانات.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function normalizeSaudiPhone(phone) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("966")) return d;
  if (d.startsWith("0") && d.length === 10 && d[1] === "5") return "966" + d.slice(1);
  if (d.startsWith("5") && d.length === 9) return "966" + d;
  return d;
}

try {
  const users = await prisma.user.findMany({ where: { phone: { not: null } }, select: { phone: true } });
  const withPhone = users.length;
  let nonCanonical = 0;
  let target = 0; // الرقم المُبلَّغ عنه (0564099173 ⟵ 966564099173)
  for (const u of users) {
    const canon = normalizeSaudiPhone(u.phone);
    if (u.phone !== `+${canon}`) nonCanonical++; // مخزَّنٌ بصيغةٍ غير الموحّدة E.164
    if (canon === "966564099173") target++;
  }
  console.log(`\n═══ صيغ الجوال ═══`);
  console.log(`مستخدمون بجوالٍ مخزَّن = ${withPhone}`);
  console.log(`منهم بصيغةٍ غير موحّدة (ليست +9665…) = ${nonCanonical}`);
  console.log(`تسجيلات الرقم 0564099173 (966564099173) = ${target}`);
  console.log(`\n✅ READ-ONLY DIAG OK`);
} catch (e) {
  console.error("❌ QUERY FAILED:", e?.name, e?.code, e?.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
