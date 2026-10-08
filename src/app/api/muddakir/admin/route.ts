import { MuddakirRequestType } from "@prisma/client";

import { requireMuddakir } from "@/server/muddakir-staff";
import { performOrRequest } from "@/server/muddakir-requests";
import {
  listDegreeRaises,
  listMuddakirPointItems,
  listMuddakirSettings,
  listTathbitLadder,
  setMuddakirPointItem,
  setMuddakirSetting,
  setTathbitDegree,
} from "@/server/muddakir-config";
import { errorResponse } from "@/server/http";
import { AuthorizationError, ValidationError } from "@/server/errors";

// GET /api/muddakir/admin — إعدادات التثبيت: السلّم، الإعدادات، بنود النقاط، وسجلّ الرفع.
// للمدير والإداريّ (قراءةٌ بلا موافقة).
export async function GET(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (!actor.caps.manage && !actor.caps.admin) throw new AuthorizationError("هذه الشاشة لمدير البرنامج أو الإداريّ.");
    const [ladder, settings, pointItems, raises] = await Promise.all([
      listTathbitLadder(),
      listMuddakirSettings(),
      listMuddakirPointItems(),
      listDegreeRaises(),
    ]);
    return Response.json({ canManage: actor.caps.manage, ladder, settings, pointItems, raises });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/muddakir/admin — المدير ينفّذ مباشرة؛ الإداريّ يُنشئ طلباً. الإجراءات:
// { action:"ladder", degreeNo, patch } · { action:"setting", key, value } · { action:"pointItem", … }
export async function POST(req: Request) {
  try {
    const actor = await requireMuddakir(req, "view");
    if (!actor.caps.manage && !actor.caps.admin) throw new AuthorizationError("هذا الإجراء لمدير البرنامج أو الإداريّ.");
    const b = (await req.json()) as Record<string, unknown>;

    if (b.action === "ladder") {
      if (typeof b.degreeNo !== "number" || typeof b.patch !== "object" || b.patch == null) throw new ValidationError("الدرجة والتعديل مطلوبان.");
      const degreeNo = b.degreeNo;
      const patch = b.patch as { dailyJuz?: number; khatmaDays?: number; khatmaCount?: number; active?: boolean };
      const r = await performOrRequest(actor, { type: MuddakirRequestType.SET_TATHBIT_LADDER, payload: { degreeNo, patch }, direct: () => setTathbitDegree(degreeNo, patch, actor.id) });
      return Response.json(r, { status: r.executed ? 200 : 202 });
    }
    if (b.action === "setting") {
      if (typeof b.key !== "string" || b.value === undefined) throw new ValidationError("المفتاح والقيمة مطلوبان.");
      const key = b.key;
      const value = b.value as import("@prisma/client").Prisma.InputJsonValue;
      const r = await performOrRequest(actor, { type: MuddakirRequestType.SET_SETTING, payload: { key, value }, direct: () => setMuddakirSetting(key, value, actor.id) });
      return Response.json(r, { status: r.executed ? 200 : 202 });
    }
    if (b.action === "pointItem") {
      if (typeof b.nameAr !== "string" || typeof b.value !== "number" || typeof b.eventType !== "string") throw new ValidationError("بيانات البند مطلوبة.");
      const input = { id: typeof b.id === "string" ? b.id : undefined, nameAr: b.nameAr, value: b.value, eventType: b.eventType as import("@prisma/client").AutoEventType, active: b.active as boolean | undefined };
      const r = await performOrRequest(actor, { type: MuddakirRequestType.SET_POINT_ITEM, payload: { ...input }, direct: () => setMuddakirPointItem(input, actor.id) });
      return Response.json(r, { status: r.executed ? 200 : 202 });
    }
    throw new ValidationError("الإجراء مطلوب (ladder/setting/pointItem).");
  } catch (e) {
    return errorResponse(e);
  }
}
