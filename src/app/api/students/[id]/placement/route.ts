import { Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { getPlacementView } from "@/server/placement-view";
import { placeQaidahLessons, placeMaraqi, changeStudentProgram } from "@/server/placement-actions";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

// تسكين الطالب وتغيير برنامجه (ق٢/ق٣/ق٧) — المشرف/المدير/المدير التقنيّ (الحارس المطلق في الخادم).
const ROLES = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER, Role.TECH_ADMIN];

// GET → بيانات شاشة التسكين (البرنامج الحاليّ + المعلّق + القائمة + دروس القاعدة/تسكين مراقي).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    return Response.json(await getPlacementView(actor.id, id));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST { action, … } → تنفيذ فعلٍ واحد (تغيير البرنامج | تسكين القاعدة | تسكين مراقي).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id } = await ctx.params;
    const b = (await req.json()) as Record<string, unknown>;
    switch (b.action) {
      case "change-program": {
        if (typeof b.programId !== "string") throw new ValidationError("البرنامج مطلوب.");
        return Response.json(await changeStudentProgram({ actorId: actor.id, studentId: id, programId: b.programId }));
      }
      case "place-qaidah": {
        if (typeof b.currentLessonId !== "string") throw new ValidationError("الدرس الحاليّ مطلوب.");
        return Response.json(await placeQaidahLessons({ actorId: actor.id, studentId: id, currentLessonId: b.currentLessonId }));
      }
      case "place-maraqi": {
        const reachedSurah = typeof b.reachedSurah === "number" ? b.reachedSurah : null;
        const reachedAyah = typeof b.reachedAyah === "number" ? b.reachedAyah : null;
        const outOfOrder = Array.isArray(b.outOfOrder) ? (b.outOfOrder as { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number }[]) : [];
        return Response.json(await placeMaraqi({ actorId: actor.id, studentId: id, reachedSurah, reachedAyah, outOfOrder }));
      }
      default:
        throw new ValidationError("فعلٌ غير معروف.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
