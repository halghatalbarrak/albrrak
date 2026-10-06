import { ProgramKey, type Prisma, type PrismaClient } from "@prisma/client";

import { getProgramSetting } from "./settings";

// إنشاء ملفّ الحافظ (MuddakirProfile) بقيمه الافتراضيّة — idempotent. مفصولٌ في وحدةٍ صغيرة لا
// تستورد program-placement، كي تستدعيه آليّة الانتقال (applyDueOn) ودالّة الإلحاق معًا بلا دور.

type Db = PrismaClient | Prisma.TransactionClient;

// المرحلة الأولى: المراحل الستّ محسوبةٌ من بيانات المصحف (deriveStages) لا صفوف Stage، فيُخزَّن
// رقمها نصًّا في currentStageId. «1» = المرحلة الأولى (الفاتحة…).
export const MUDDAKIR_FIRST_STAGE = "1";

/** مُعرّف برنامج المُدَّكِر (من المفتاح، لا رقمٌ مكتوب). يرمي إن لم يُبذَر البرنامج. */
export async function muddakirProgramId(db: Db): Promise<string> {
  const p = await db.program.findUnique({ where: { key: ProgramKey.MUDDAKIR }, select: { id: true } });
  if (!p) throw new Error("برنامج المُدَّكِر غير مبذور.");
  return p.id;
}

/** مسار البداية للحافظ الجديد = أدنى المسارات المتاحة من Setting (افتراضيّ ١) — لا قيمة مكتوبة. */
async function startingTrack(db: Db, programId: string): Promise<number> {
  const v = await getProgramSetting(programId, "tracks", db as PrismaClient);
  if (Array.isArray(v)) {
    const nums = v.filter((x): x is number => typeof x === "number");
    if (nums.length) return Math.min(...nums);
  }
  return 1;
}

/**
 * يضمن وجود ملفّ مُدَّكِرٍ للحافظ بقيمه الافتراضيّة (المسار الأدنى، المرحلة الأولى، mode=ACTIVE،
 * deliveryMode=IN_PERSON يضبطه المدير لاحقًا). idempotent: نداءٌ ثانٍ لا يغيّر شيئًا (update فارغ).
 */
export async function ensureMuddakirProfile(db: Db, studentId: string): Promise<void> {
  const programId = await muddakirProgramId(db);
  const track = await startingTrack(db, programId);
  await db.muddakirProfile.upsert({
    where: { studentId },
    update: {}, // موجودٌ ⟵ لا تكرار، لا تغيير
    create: { studentId, track, currentStageId: MUDDAKIR_FIRST_STAGE },
  });
}
