import { Gender, Role } from "@prisma/client";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { assertCanAddToCircle, quickAddStudent } from "@/server/add-student";

export const dynamic = "force-dynamic";

const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN];

// POST /api/circles/[id]/add-student
// يُضيف طالبًا سريعًا من الشاشة الموحّدة.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const actor = await requireRoles(req, ROLES);
    const { id: circleId } = await params;

    const body = (await req.json()) as {
      nameAsInId?: string;
      birthDate?: string;
      gender?: string;
      guardianPhone?: string;
      programId?: string;
    };

    if (!body.nameAsInId?.trim())
      return Response.json({ error: "الاسم مطلوب" }, { status: 400 });
    if (!body.birthDate)
      return Response.json({ error: "تاريخ الميلاد مطلوب" }, { status: 400 });
    if (!body.guardianPhone?.trim())
      return Response.json({ error: "جوال ولي الأمر مطلوب" }, { status: 400 });
    if (!body.programId)
      return Response.json({ error: "البرنامج مطلوب" }, { status: 400 });

    const gender = body.gender === "FEMALE" ? Gender.FEMALE : Gender.MALE;

    await assertCanAddToCircle(actor.id, actor.roles, circleId);

    const result = await quickAddStudent(actor.id, circleId, {
      nameAsInId: body.nameAsInId,
      birthDate: new Date(body.birthDate),
      gender,
      guardianPhone: body.guardianPhone,
      programId: body.programId,
    });

    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
