import { Role } from "@prisma/client";

import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";
import { verr } from "@/server/errors";
import { listAllReferenceValues } from "@/server/list-values";
import { listPrograms } from "@/server/circles";
import {
  parseStudentsCsv,
  validateRows,
  loadExistingIdKeys,
  commitImport,
} from "@/server/student-import";

// POST /api/admin/students/import/commit — الحفظ الفعليّ (للمشرف العام).
// يُعيد تحليل الملفّ والتحقّق منه على الخادم (لا يثق بالعميل)، ثم يحفظ السطور غير الخاطئة
// (صالح/تحذير) في الحلقة المختارة عبر دوالّ الإنشاء القائمة. يعيد تقريرًا بلا رقم هويّةٍ صريح.
export async function POST(req: Request) {
  try {
    const actor = await requireRoles(req, [Role.SUPER_ADMIN]);
    const body = (await req.json().catch(() => null)) as {
      csv?: unknown;
      circleId?: unknown;
      defaultProgramId?: unknown;
      overrides?: Record<number, { nationalityId?: string; guardianRelationId?: string; emergencyRelationId?: string }>;
    } | null;
    if (!body || typeof body.csv !== "string") throw verr("displayFileRequired");
    if (typeof body.circleId !== "string" || !body.circleId) throw verr("circleRequiredField");

    const parsed = parseStudentsCsv(body.csv);
    if (!parsed.ok) throw verr("importMissingColumns");

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

    // تُحفظ السطور الصالحة (صالح/تحذير) فقط — ويُستثنى الخطأ والمتخطّى (المستورَد سابقًا).
    const committable = results.filter((r) => (r.level === "valid" || r.level === "warning") && r.resolved);
    if (committable.length === 0) throw verr("importNoValidRows");

    const report = await commitImport({ rows: committable, circleId: body.circleId, decidedBy: actor.id });
    return Response.json(report);
  } catch (e) {
    return errorResponse(e);
  }
}
