import { DisplayScreenKind, Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { createScreen, issueToken, listScreens, revokeToken } from "@/server/display/screens";
import { addProgramSlide, getScreenDetail, listProgramsForSlides, reorderSlides, searchStudents, setSlide } from "@/server/display/admin";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const ADMIN: Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];

// GET /api/admin/display — قائمة الشاشات + البرامج؛ أو ?screenId=.. لتفصيل شاشة.
export async function GET(req: Request) {
  try {
    await requireRoles(req, ADMIN);
    const sp = new URL(req.url).searchParams;
    const students = sp.get("students");
    if (students != null) return Response.json({ students: await searchStudents(students) });
    const screenId = sp.get("screenId");
    if (screenId) return Response.json({ detail: await getScreenDetail(screenId) });
    const [screens, programs] = await Promise.all([listScreens(), listProgramsForSlides()]);
    return Response.json({ screens, programs });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/display — إجراءات: إنشاء شاشة، توليد/إلغاء رمز، شرائح برنامج، ضبط/ترتيب.
// (رفع الصور والخلفيّات في /api/admin/display/upload.)
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, ADMIN);
    const b = (await req.json()) as Record<string, unknown>;
    switch (b.action) {
      case "createScreen": {
        if (b.kind !== "MOSQUE" && b.kind !== "HOME") throw new ValidationError("نوع الشاشة مطلوب.");
        return Response.json(await createScreen({ kind: b.kind as DisplayScreenKind, nameAr: String(b.nameAr ?? ""), studentId: typeof b.studentId === "string" ? b.studentId : null, refreshSec: typeof b.refreshSec === "number" ? b.refreshSec : undefined }), { status: 201 });
      }
      case "issueToken": {
        if (typeof b.screenId !== "string") throw new ValidationError("الشاشة مطلوبة.");
        return Response.json(await issueToken(b.screenId)); // { token } — يُعرض مرّةً واحدة
      }
      case "revokeToken": {
        if (typeof b.screenId !== "string") throw new ValidationError("الشاشة مطلوبة.");
        return Response.json(await revokeToken(b.screenId));
      }
      case "addProgramSlide": {
        if (typeof b.screenId !== "string" || typeof b.programId !== "string") throw new ValidationError("الشاشة والبرنامج مطلوبان.");
        return Response.json(await addProgramSlide(actor.id, b.screenId, b.programId, typeof b.durationSec === "number" ? b.durationSec : undefined), { status: 201 });
      }
      case "setSlide": {
        if (typeof b.slideId !== "string") throw new ValidationError("الشريحة مطلوبة.");
        await setSlide(actor.id, b.slideId, { durationSec: typeof b.durationSec === "number" ? b.durationSec : undefined, active: typeof b.active === "boolean" ? b.active : undefined });
        return Response.json({ ok: true });
      }
      case "reorder": {
        if (typeof b.screenId !== "string" || !Array.isArray(b.orderedIds)) throw new ValidationError("الترتيب مطلوب.");
        await reorderSlides(actor.id, b.screenId, b.orderedIds.filter((x): x is string => typeof x === "string"));
        return Response.json({ ok: true });
      }
      default:
        throw new ValidationError("إجراءٌ غير معروف.");
    }
  } catch (e) {
    return errorResponse(e);
  }
}
