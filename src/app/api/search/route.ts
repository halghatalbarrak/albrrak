import { Role } from "@prisma/client";

import { searchAll } from "@/server/search";
import { requireRoles } from "@/server/auth";
import { errorResponse } from "@/server/http";

// البحث الموحّد أداةُ كادر (لا يبحث الطالب في غيره).
const ROLES = [Role.TEACHER, Role.CIRCLE_MANAGER, Role.SUPER_ADMIN, Role.RECITER, Role.REGISTRAR];

// GET /api/search?q=... — نتائج مصنّفة (طلاب/حلقات/مصحف). قراءةٌ فقط.
export async function GET(req: Request) {
  try {
    await requireRoles(req, ROLES);
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return Response.json(await searchAll(q));
  } catch (e) {
    return errorResponse(e);
  }
}
