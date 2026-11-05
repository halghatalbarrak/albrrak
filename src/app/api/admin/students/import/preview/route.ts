import { Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { ValidationError } from "@/server/errors";
import { listAllReferenceValues } from "@/server/list-values";
import { listPrograms } from "@/server/circles";
import {
  parseStudentsCsv,
  validateRows,
  loadExistingIdKeys,
} from "@/server/student-import";

// POST /api/admin/students/import/preview — تحليلٌ وتحقّقٌ للقراءة (للمشرف العام).
// يعيد حالة كلّ سطرٍ وعلله وقوائم المرجع للتصحيح اليدويّ — **بلا رقم هويّةٍ صريح** (مجرّد
// آخر ٤ خانات في maskedId). كشف التكرار يفكّ الأرقام في الذاكرة ولا يسجّلها ولا يعيدها.
export async function POST(req: Request) {
  try {
    await requireRoles(req, [Role.SUPER_ADMIN]);
    const body = (await req.json().catch(() => null)) as {
      csv?: unknown;
      defaultProgramId?: unknown;
      overrides?: Record<number, { nationalityId?: string; guardianRelationId?: string; emergencyRelationId?: string }>;
    } | null;
    if (!body || typeof body.csv !== "string") throw new ValidationError("الملفّ مطلوب.");

    const parsed = parseStudentsCsv(body.csv);
    if (!parsed.ok) {
      return Response.json({ ok: false, missingColumns: parsed.missingColumns });
    }

    const lists = await listAllReferenceValues();
    const nationalities = lists.nationalities.filter((n) => n.isActive).map((n) => ({ id: n.id, nameAr: n.nameAr }));
    const guardianRelations = lists.guardianRelations.filter((r) => r.isActive).map((r) => ({ id: r.id, nameAr: r.nameAr }));
    const { userIds, applicationIds } = await loadExistingIdKeys();
    const programs = (await listPrograms()).map((p) => ({ id: p.id, nameAr: p.nameAr }));
    const defaultProgramId = typeof body.defaultProgramId === "string" && body.defaultProgramId ? body.defaultProgramId : null;

    const results = validateRows(parsed.rows, {
      nationalities,
      guardianRelations,
      programs,
      defaultProgramId,
      existingUserIds: userIds,
      existingApplicationIds: applicationIds,
      overrides: body.overrides,
    });

    // لا يُعاد «resolved» إلى المتصفّح (يحمل رقم الهويّة الصريح وبياناتٍ شخصيّة).
    const safe = results.map((r) => ({ index: r.index, level: r.level, issues: r.issues, name: r.name, maskedId: r.maskedId, skip: r.skip }));
    return Response.json({ ok: true, results: safe, references: { nationalities, guardianRelations, programs } });
  } catch (e) {
    return errorResponse(e);
  }
}
