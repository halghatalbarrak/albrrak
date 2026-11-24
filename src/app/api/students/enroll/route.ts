import { Gender, Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { enrollNewStudent, type ProgramFields } from "@/server/enroll-new-student";

export const dynamic = "force-dynamic";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/students/enroll
// يُسجّل طالبًا كامل الإعداد (بديل quickAddStudent).
export async function POST(req: Request): Promise<Response> {
  try {
    const actor = await requireRoles(req, ROLES);

    const body = (await req.json()) as {
      nameAsInId?: string;
      birthDateIso?: string;
      gender?: string;
      guardianPhone?: string;
      guardianName?: string;
      circleId?: string;
      programId?: string;
      programFields?: unknown;
      schoolStage?: string;
      studentPhone?: string;
      notes?: string;
    };

    if (!body.nameAsInId?.trim())
      return Response.json({ error: "الاسم مطلوب", key: "enrollNameRequired" }, { status: 400 });
    if (!body.birthDateIso)
      return Response.json({ error: "تاريخ الميلاد مطلوب", key: "enrollBirthDateRequired" }, { status: 400 });
    if (!body.guardianPhone?.trim())
      return Response.json({ error: "جوال ولي الأمر مطلوب", key: "quickAddGuardianPhoneRequired" }, { status: 400 });
    if (!body.circleId)
      return Response.json({ error: "الحلقة مطلوبة", key: "circleNotFound" }, { status: 400 });
    if (!body.programId)
      return Response.json({ error: "البرنامج مطلوب", key: "programRequired" }, { status: 400 });
    if (!body.programFields)
      return Response.json({ error: "بيانات البرنامج مطلوبة", key: "programRequired" }, { status: 400 });

    const gender = body.gender === "FEMALE" ? Gender.FEMALE : Gender.MALE;
    const birthDate = new Date(body.birthDateIso);
    if (isNaN(birthDate.getTime()))
      return Response.json({ error: "تاريخ الميلاد غير صالح", key: "enrollBirthDateRequired" }, { status: 400 });

    const result = await enrollNewStudent(
      actor.id,
      actor.roles,
      {
        nameAsInId: body.nameAsInId,
        birthDate,
        gender,
        guardianPhone: body.guardianPhone,
        guardianName: body.guardianName,
        circleId: body.circleId,
        programId: body.programId,
        programFields: body.programFields as ProgramFields,
        schoolStage: body.schoolStage,
        studentPhone: body.studentPhone,
        notes: body.notes,
      },
    );

    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
