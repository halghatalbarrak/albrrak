import { requestAbsenceExcuse, requestPreExcuse } from "@/server/attendance";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

// POST /api/attendance/excuse — الطالب/الولي يقدّم طلب عذرٍ أو استئذانٍ مسبق (§١٠٫٢).
//   kind: "PRE"    ⟵ مستأذن مسبقًا (تاريخٌ لم يأتِ بعد)
//   kind: "EXCUSE" ⟵ غائب بعذر (غيابٌ واقع)
// القبول لاحقًا بيد صاحب صلاحية ABSENCE_EXCUSE (مسارٌ منفصل).
export async function POST(req: Request) {
  try {
    const actor = await requireAuth(req);
    const b = (await req.json()) as {
      studentId?: unknown;
      date?: unknown;
      reason?: unknown;
      kind?: unknown;
    };
    if (typeof b.studentId !== "string") throw new ValidationError("الطالب مطلوب.");
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");
    if (typeof b.reason !== "string" || !b.reason.trim()) {
      throw new ValidationError("سبب العذر مطلوب.");
    }
    if (b.kind !== "PRE" && b.kind !== "EXCUSE") {
      throw new ValidationError("نوع الطلب غير معروف.");
    }

    const args = {
      studentId: b.studentId,
      date: b.date,
      reason: b.reason,
      requestedBy: actor.id,
    };
    const approval =
      b.kind === "PRE" ? await requestPreExcuse(args) : await requestAbsenceExcuse(args);
    return Response.json({ approvalId: approval.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
