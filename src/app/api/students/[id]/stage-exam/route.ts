import { Role } from "@prisma/client";
import { recordStageExam, type HizbExamInput } from "@/server/stage-exam";
import { assertReadyForStageExam } from "@/server/stage-exam-leave";
import type { HasadErrorInput, HasadHesitationInput } from "@/server/hasad";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/students/[id]/stage-exam — المختبِر المحايد يسجّل اختبار المرحلة على كامل المحفوظ
// (حزبًا حزبًا: أخطاء + ترددات). البوّابة المطلقة (assertReadyForStageExam) قبل recordStageExam
// (لا اختبار قبل انقضاء الإجازة، ولا لمن له اقتراح معلّق). الحياد داخل recordStageExam. المختبِر
// = هويّة الفاعل (لا من الجسم). أدوار: المُسمِّع/المدير/المشرف.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, [Role.RECITER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN]);
    const { id } = await ctx.params;
    const b = (await req.json()) as { mainStageId?: unknown; startedOn?: unknown; hizbs?: unknown };
    if (typeof b.mainStageId !== "string") throw new ValidationError("المرحلة الأصلية مطلوبة.");
    if (typeof b.startedOn !== "string") throw new ValidationError("تاريخ البدء مطلوب.");
    if (!Array.isArray(b.hizbs) || b.hizbs.length === 0) throw new ValidationError("قائمة الأحزاب مطلوبة.");

    const hizbs: HizbExamInput[] = b.hizbs.map((rawHizb) => {
      const h = rawHizb as { stageId?: unknown; errors?: unknown; hesitations?: unknown };
      if (typeof h.stageId !== "string") throw new ValidationError("حزبٌ بلا مرحلة.");
      if (!Array.isArray(h.errors)) throw new ValidationError("قائمة أخطاء الحزب مطلوبة.");
      const errors: HasadErrorInput[] = h.errors.map((raw) => {
        const e = raw as { pageNo?: unknown; errorType?: unknown; surah?: unknown; ayah?: unknown };
        if (typeof e.pageNo !== "number" || typeof e.errorType !== "string") {
          throw new ValidationError("خطأٌ غير صالح (يلزم صفحة ونوع).");
        }
        return {
          pageNo: e.pageNo,
          errorType: e.errorType as HasadErrorInput["errorType"],
          ...(typeof e.surah === "number" ? { surah: e.surah } : {}),
          ...(typeof e.ayah === "number" ? { ayah: e.ayah } : {}),
        };
      });
      const hesitations: HasadHesitationInput[] = Array.isArray(h.hesitations)
        ? h.hesitations.map((raw) => {
            const x = raw as { faceNo?: unknown };
            if (typeof x.faceNo !== "number") throw new ValidationError("تردّدٌ غير صالح (يلزم رقم وجه).");
            return { faceNo: x.faceNo };
          })
        : [];
      return { stageId: h.stageId, errors, hesitations };
    });

    // البوّابة المطلقة قبل التسجيل — recordStageExam لا يُعدَّل.
    await assertReadyForStageExam({ studentId: id, mainStageId: b.mainStageId });

    const outcome = await recordStageExam({
      studentId: id,
      mainStageId: b.mainStageId,
      examinerId: actor.id,
      startedOn: b.startedOn,
      hizbs,
    });
    return Response.json(outcome, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
