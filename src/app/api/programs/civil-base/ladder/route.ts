import { requireAuth } from "@/server/auth";
import { getQaidahLadderForViewer } from "@/server/civil-base";
import { errorResponse } from "@/server/http";

// السلّم البياني للقاعدة المدنية — لأيّ داخلٍ مصادَق (teacherNotes للمعلم/المدير فقط).
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    const view = await getQaidahLadderForViewer(actor);
    return Response.json(view);
  } catch (e) {
    return errorResponse(e);
  }
}
