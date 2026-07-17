// تشخيص سقوط القبول (POST /api/applications/<id>/decision → 500) — بلا تخمين.
//
// ⚠️ يتّصل بقاعدة الإنتاج مباشرةً (DATABASE_URL من أسرار GitHub) — لكنّه لا يغيّر
//    فيها حرفًا: كتابات القبول تجري داخل معاملةٍ تُلغى بالتراجع عمدًا. أداة تشخيص
//    لا هجرة؛ لا تُشغَّل إلا عند الحاجة، وقراءتها آمنة على الإنتاج.
//
// (١) يقرأ أقدم طلبٍ معلّق ويطبع عمره وحقوله الجديدة.
// (٢) يعيد إنتاج كتابات القبول داخل معاملةٍ تُلغى بالتراجع — لا مساس بالإنتاج.
// (٣) يفحص SERVICE_ROLE_KEY بنداءٍ فارغٍ لا يُنشئ شيئًا (401 = مفتاح خاطئ، 422 = سليم).
// لا يطبع أي سرّ. رسائل أخطاء Prisma تُخفي بيانات الاعتماد.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function computeAge(b, asOf) {
  let a = asOf.getFullYear() - b.getFullYear();
  const m = asOf.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < b.getDate())) a -= 1;
  return a;
}
const digits = (p) => String(p ?? "").replace(/\D/g, "");
const syntheticEmail = (p) => `u${digits(p)}@albrrak.app`;

const app = await prisma.application.findFirst({
  where: { status: "PENDING" },
  orderBy: { createdAt: "asc" },
});

if (!app) {
  console.log("لا طلب معلّق (PENDING) للتشخيص. لعلّه قُبِل أو رُفض.");
  await prisma.$disconnect();
  process.exit(0);
}

const age = computeAge(new Date(app.birthDate), new Date());
const createsAccount = age >= 13;
console.log("──────── الطلب المعلّق ────────");
console.log(`العمر = ${age}  ·  ≥١٣ (يُنشأ حساب)؟ ${createsAccount ? "نعم" : "لا"}  ·  studentPhone: ${app.studentPhone ? "موجود" : "∅"}`);
console.log(`guardianRelationId: ${app.guardianRelationId ?? "∅"}  ·  emergencyRelationId: ${app.emergencyRelationId ?? "∅"}  ·  emergencyName: ${app.emergencyName ? "موجود" : "∅"}`);
if (createsAccount) {
  console.log("⚠️  ≥١٣ ⟵ القبول الحقيقي يستدعي auth-provider (service_role). التشخيص يعزله ويختبر الكتابة وحدها، ثم يفحص المفتاح في (٣).");
} else {
  console.log("✓  دون ١٣ ⟵ auth-provider لا يُستدعى (م٤). فالكتابة وحدها هي المشتبه — نختبرها في (٢).");
}

// ───── (٢) إعادة إنتاج كتابات القبول، ثم تراجُع ─────
const ROLLBACK = "DIAG_ROLLBACK";
try {
  await prisma.$transaction(async (tx) => {
    const nat = await tx.nationality.findUniqueOrThrow({ where: { id: app.nationalityId } });
    const user = await tx.user.create({
      data: {
        nameAsInId: app.nameAsInId,
        nationalId: app.nationalIdEnc,
        nationality: nat.nameAr,
        birthDate: app.birthDate,
        gender: app.gender,
        phone: app.studentPhone ?? null,
        authId: null,
        roles: ["STUDENT"],
      },
    });
    const student = await tx.student.create({
      data: {
        userId: user.id,
        state: "AWAITING_READING_TEST",
        emergencyName: app.emergencyName,
        emergencyPhone: app.emergencyPhone,
        emergencyRelationId: app.emergencyRelationId,
      },
    });
    const gEmail = syntheticEmail(app.guardianPhone);
    const existing = await tx.user.findUnique({ where: { email: gEmail }, select: { id: true } });
    const guardian =
      existing ??
      (await tx.user.create({
        data: {
          nameAsInId: `ولي أمر (${app.guardianPhone})`,
          gender: app.guardianGender,
          roles: ["GUARDIAN"],
          email: gEmail,
          phone: app.guardianPhone,
        },
        select: { id: true },
      }));
    await tx.guardianLink.create({
      data: { guardianId: guardian.id, studentId: student.id, relationId: app.guardianRelationId },
    });
    await tx.event.create({ data: { type: "STUDENT_ACCEPTED", subjectType: "Student", subjectId: student.id } });
    await tx.event.create({ data: { type: "APPLICATION_ACCEPTED", subjectType: "Application", subjectId: app.id } });
    await tx.application.update({ where: { id: app.id }, data: { status: "ACCEPTED", studentId: student.id } });
    console.log("\n──────── (٢) كتابات القبول ────────");
    console.log("✅ نجحت كل كتابات القبول (ستُلغى بالتراجع — لا مساس بالإنتاج).");
    throw new Error(ROLLBACK);
  });
} catch (e) {
  if (e?.message === ROLLBACK) {
    console.log("↩️ تراجُعٌ متعمّد — القاعدة سليمةٌ للكتابة.");
    console.log(createsAccount
      ? "   ⟵ فالعطب إذن في auth-provider (service_role)، لا في الكتابة. انظر (٣)."
      : "   ⟵ ودون ١٣ لا يُستدعى المفتاح ⟵ إن كان القبول يسقط فعلًا، فالتناقض يعني أنّ الطلب الفعليّ ليس دون ١٣، أو أنّ نشرة Vercel أقدم من a1fcee3.");
  } else {
    console.log("\n──────── (٢) كتابات القبول ────────");
    console.error("❌ فشلت كتابةٌ من كتابات القبول — هذا خطأ وقت التشغيل الحقيقي:");
    console.error("  name:   ", e?.name);
    console.error("  code:   ", e?.code);
    console.error("  message:", e?.message);
  }
}

// ───── (٣) فحص service_role (غير متلف: جسمٌ فارغ لا يُنشئ مستخدمًا) ─────
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("\n──────── (٣) فحص SERVICE_ROLE ────────");
if (!url || !key) {
  console.log("↷ لم يُضبَط NEXT_PUBLIC_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY كسرٍّ في GitHub — تخطّي الفحص.");
} else {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({}),
    });
    console.log(`admin/users (جسم فارغ) ⟵ HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) {
      console.log("❌ 401/403 ⟵ المفتاح خاطئٌ أو غير مخوّل — هذا سبب سقوط قبول ≥١٣.");
    } else if (res.status === 400 || res.status === 422) {
      console.log("✅ 400/422 ⟵ المفتاح سليمٌ ومخوّل (الرفض بسبب الجسم الفارغ لا المفتاح).");
    } else {
      console.log("ℹ️ حالةٌ أخرى — انظر الرقم أعلاه.");
    }
  } catch (e) {
    console.error("❌ تعذّر الوصول إلى Supabase Admin:", e?.name, e?.message);
  }
}

await prisma.$disconnect();
