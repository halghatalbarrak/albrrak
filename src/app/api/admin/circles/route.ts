import { Gender, Role, TimeSlot } from "@prisma/client";
import { createCircle, listCircles, listPrograms } from "@/server/circles";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";

const MANAGER = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];
// القراءة تشمل المُسجِّل — يحتاج قائمة الحلقات لإسناد الطالب عند التحديد.
const READERS = [Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.REGISTRAR];

// GET /api/admin/circles — الحلقات + البرامج (لنموذج الإنشاء وللإسناد).
export async function GET(req: Request) {
  try {
    await requireRoles(req, READERS);
    const [circles, programs] = await Promise.all([listCircles(), listPrograms()]);
    return Response.json({ circles, programs });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/circles — إنشاء حلقة { nameAr, timeSlot, gender, programId, location? }.
export async function POST(req: Request) {
  try {
    await requireRoles(req, MANAGER);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.timeSlot !== TimeSlot.ASR && b.timeSlot !== TimeSlot.MAGHRIB) {
      throw new ValidationError("وقت الحلقة غير صالح (عصر/مغرب).");
    }
    if (b.gender !== Gender.MALE && b.gender !== Gender.FEMALE) {
      throw new ValidationError("جنس الحلقة غير صالح.");
    }
    if (typeof b.nameAr !== "string") throw new ValidationError("اسم الحلقة مطلوب.");
    if (typeof b.programId !== "string") throw new ValidationError("البرنامج مطلوب.");
    const circle = await createCircle({
      nameAr: b.nameAr,
      timeSlot: b.timeSlot,
      gender: b.gender,
      programId: b.programId,
      location: typeof b.location === "string" ? b.location : null,
    });
    return Response.json(circle, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
