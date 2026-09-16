import { listBidderForStudent } from "@/server/market";
import { requireAuth } from "@/server/auth";
import { errorResponse } from "@/server/http";

// GET /api/market/bidder?studentId= — بيدر الطالب (نافذةٌ للعرض) للطالب نفسه أو وليّه.
// بلا studentId: بيدر الحساب نفسه إن كان طالبًا. لا يكشف مصدر الثمرة (م٦ب-٢).
export async function GET(req: Request) {
  try {
    const actor = await requireAuth(req);
    const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
    return Response.json({ items: await listBidderForStudent(actor.id, studentId) });
  } catch (e) {
    return errorResponse(e);
  }
}
