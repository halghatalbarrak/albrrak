import { Role } from "@prisma/client";
import {
  getSessionView,
  recordHifz,
  recordMurajaah,
  recordTarseekh,
} from "@/server/daily-session";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// GET /api/students/[id]/session?date=YYYY-MM-DD — موضع الطالب + جلسة يومه.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const date = new URL(req.url).searchParams.get("date");
    if (!date) throw new ValidationError("التاريخ مطلوب.");
    const view = await getSessionView(actor.id, id, date);
    return Response.json(view);
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/students/[id]/session — تسجيل جزءٍ من الجلسة { kind, date, ... }.
//   hifz     ⟵ المعلم وحده (النطاق/المحاولات/أتقن)
//   tarseekh ⟵ تمّ/لم يتم
//   murajaah ⟵ تمّ/لم يتم
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as Record<string, unknown>;
    if (typeof b.date !== "string") throw new ValidationError("التاريخ مطلوب.");

    if (b.kind === "hifz") {
      const nums = ["fromSurah", "fromAyah", "toSurah", "toAyah", "attempts"] as const;
      for (const k of nums) {
        if (typeof b[k] !== "number") throw new ValidationError(`الحقل ${k} مطلوب.`);
      }
      if (typeof b.mastered !== "boolean") throw new ValidationError("حقل «أتقن» مطلوب.");
      await recordHifz({
        studentId: id,
        date: b.date,
        fromSurah: b.fromSurah as number,
        fromAyah: b.fromAyah as number,
        toSurah: b.toSurah as number,
        toAyah: b.toAyah as number,
        attempts: b.attempts as number,
        mastered: b.mastered,
        teacherId: actor.id,
      });
      return Response.json({ ok: true }, { status: 201 });
    }

    if (b.kind === "tarseekh" || b.kind === "murajaah") {
      if (typeof b.done !== "boolean") throw new ValidationError("حقل «تمّ» مطلوب.");
      // تسميعٌ مرن (الحكم ٦): المعلّم هو الفاعل المسؤول، وله أن يُسنِد من سمّع فعلاً.
      const args = {
        studentId: id,
        date: b.date,
        done: b.done,
        actorId: actor.id,
        ...(typeof b.listenerId === "string" ? { listenerId: b.listenerId } : {}),
      };
      if (b.kind === "tarseekh") await recordTarseekh(args);
      else await recordMurajaah(args);
      return Response.json({ ok: true }, { status: 201 });
    }

    throw new ValidationError("نوع الرصد غير معروف (hifz/tarseekh/murajaah).");
  } catch (e) {
    return errorResponse(e);
  }
}
