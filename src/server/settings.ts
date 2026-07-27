import { type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { emitEvent } from "./events";
import { ValidationError } from "./errors";

/**
 * إعدادات لكل برنامج — تُخزَّن في جدول Setting (key/value) وتُعدَّل وقت التشغيل.
 * الغرض المحوريّ (BUILD_PLAN §م٣): تغيير سلوكٍ كإجراء إخفاق المحطة **من الشاشة بلا نشر**.
 */

// ── إعداد إخفاق المحطة (DESIGN §٧٫٥) ──
// القيمتان مستندتان للوثيقة: «الترميم / العودة للصفر». الافتراضيّة: RESET_TO_ZERO (قرار ١٣).
export const MILESTONE_FAILURE_ACTIONS = ["RESET_TO_ZERO", "REPAIR"] as const;
export type MilestoneFailureAction = (typeof MILESTONE_FAILURE_ACTIONS)[number];
export const MILESTONE_FAILURE_ACTION_KEY = "MILESTONE_FAILURE_ACTION";
export const DEFAULT_MILESTONE_FAILURE_ACTION: MilestoneFailureAction = "RESET_TO_ZERO";

export function isMilestoneFailureAction(v: unknown): v is MilestoneFailureAction {
  return typeof v === "string" && (MILESTONE_FAILURE_ACTIONS as readonly string[]).includes(v);
}

/** يقرأ قيمة إعداد لبرنامج (أو الافتراضي إن لم تُضبط بعد). */
export async function getProgramSetting(
  programId: string,
  key: string,
  db: PrismaClient = prisma,
): Promise<Prisma.JsonValue | null> {
  const row = await db.setting.findUnique({
    where: { programId_key: { programId, key } },
    select: { value: true },
  });
  return row?.value ?? null;
}

/** إجراء إخفاق المحطة الفعّال لبرنامج — القيمة المضبوطة أو الافتراضي. */
export async function getMilestoneFailureAction(
  programId: string,
  db: PrismaClient = prisma,
): Promise<MilestoneFailureAction> {
  const v = await getProgramSetting(programId, MILESTONE_FAILURE_ACTION_KEY, db);
  return isMilestoneFailureAction(v) ? v : DEFAULT_MILESTONE_FAILURE_ACTION;
}

export interface SetSettingArgs {
  programId: string;
  key: string;
  value: Prisma.InputJsonValue;
  actorId: string;
}

/** يضبط إعدادًا لبرنامج (upsert) ويُسجّل الحدث بصاحبه. «بلا نشر». */
export async function setProgramSetting(
  args: SetSettingArgs,
  db: PrismaClient = prisma,
): Promise<void> {
  const program = await db.program.findUnique({
    where: { id: args.programId },
    select: { id: true },
  });
  if (!program) throw new ValidationError("برنامج غير موجود.");

  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { programId_key: { programId: args.programId, key: args.key } },
      update: { value: args.value },
      create: { programId: args.programId, key: args.key, value: args.value },
    });
    await emitEvent(tx, {
      type: "SETTING_CHANGED",
      subjectType: "Program",
      subjectId: args.programId,
      actorId: args.actorId,
      payload: { key: args.key, value: args.value },
    });
  });
}

/** يضبط إجراء إخفاق المحطة لبرنامج، مع تحقّق من القيمة. */
export async function setMilestoneFailureAction(
  programId: string,
  action: MilestoneFailureAction,
  actorId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  if (!isMilestoneFailureAction(action)) {
    throw new ValidationError("إجراء إخفاق غير معروف.");
  }
  await setProgramSetting(
    { programId, key: MILESTONE_FAILURE_ACTION_KEY, value: action, actorId },
    db,
  );
}
