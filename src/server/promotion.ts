import { AutoEventType, ProgressState, type Prisma } from "@prisma/client";

import { grantAuto } from "./economy";
import { emitEvent } from "./events";
import { maybeStartStageExamLeave } from "./stage-exam-leave";

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
  // منح تلقائيّ لاجتياز الحزب (م٦أ-٢) — المرجع = الحزب (المرحلة الفرعية)، فلكلّ حزبٍ منحٌ واحد.
  await grantAuto(tx, AutoEventType.HIZB_EXAM_PASS, args.studentId, args.stageId);
  // بدء إجازة اختبار المرحلة تلقائيًّا إن اكتمل بهذا الحزب آخرُ أحزاب مرحلته الأصليّة (البند ١).
  await maybeStartStageExamLeave(tx, { studentId: args.studentId, completedStageId: args.stageId, actorId: args.actorId });
}
