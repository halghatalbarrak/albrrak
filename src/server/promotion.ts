import { ProgressState, type Prisma } from "@prisma/client";

import { emitEvent } from "./events";

// ═══════════════ الترقية (م٤د — MARAQI_RULES الحكم ٧) ═══════════════
//
// توضيح محمد (الحكم ٧، محدَّث):
//   • انتقال الحزب (المرحلة الفرعية): **تلقائيّ بحصاده فقط** — لا اختبار محايدٌ منفصل،
//     ولا اعتماد مدير. نجاح الحصاد (م٤ج) يُتمّ الحزب وينقل الطالب.
//   • الاختبار المحايد + اعتماد المدير: **للمراحل الأصلية الستّ والتخرّج فقط** — مؤجَّلٌ
//     مع حصاد المرحلة الأصلية لدفعةٍ تالية.
//
// فهذه الدفعة: انتقال الحزب التلقائيّ فقط. لا اعتماد، ولا لوحة اعتمادٍ للمدير.

/**
 * انتقال الحزب التلقائيّ بعد حصاده الناجح (الحكم ٧): يُتمّ المرحلة الفرعية (COMPLETED)
 * ويُصدِر حدث SUBSTAGE_TRANSITION — **بلا اعتماد**. يُستدعى داخل معاملة recordHasad.
 * لا يمسّ المرحلة الأصلية ولا حالة الطالب (التخرّج مؤجَّلٌ بحيادٍ واعتماد).
 */
export async function autoTransitionSubStage(
  tx: Prisma.TransactionClient,
  args: { studentId: string; stageId: string; actorId: string },
): Promise<void> {
  await tx.stageProgress.upsert({
    where: { studentId_stageId: { studentId: args.studentId, stageId: args.stageId } },
    update: { state: ProgressState.COMPLETED, completedAt: new Date() },
    create: {
      student: { connect: { id: args.studentId } },
      stage: { connect: { id: args.stageId } },
      state: ProgressState.COMPLETED,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await emitEvent(tx, {
    type: "SUBSTAGE_TRANSITION",
    subjectType: "Student",
    subjectId: args.studentId,
    actorId: args.actorId,
    payload: { stageId: args.stageId, automatic: true },
  });
}
