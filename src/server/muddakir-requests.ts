import { MuddakirDeliveryMode, MuddakirRequestStatus, MuddakirRequestType, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";
import { muddakirCaps, type MuddakirActor } from "./muddakir-staff";
import { enrollInMuddakir, assignSupervisor } from "./muddakir-enrollment";
import { setStageMode } from "./muddakir-stages";
import { setMuddakirPointItem, setMuddakirSetting, setTathbitDegree } from "./muddakir-config";
import { AutoEventType } from "@prisma/client";

// ═══════════════ طلبات الإداريّ (§٢، و٢) ═══════════════
//
// الإداريّ يطّلع بلا موافقة، وكلّ إجراءٍ يغيّر شيئاً يُنشئ طلباً معلّقاً. مدير البرنامج يوافق
// (فيُنفَّذ **بالدالّة نفسها** التي ينفّذها مباشرةً، داخل معاملة، مرّةً واحدة) أو يرفض بسبب. ويلغي
// الإداريّ طلبه المعلّق. append-only (لا حذف، لا تعديل بعد الإرسال).

export interface CreateRequestArgs { actorUserId: string; type: MuddakirRequestType; payload: Prisma.InputJsonValue; studentId?: string }

/** يُنشئ طلباً معلّقاً (الإداريّ). لا ينفّذ شيئاً. */
export async function createRequest(args: CreateRequestArgs, db: PrismaClient = prisma): Promise<{ id: string }> {
  const r = await db.muddakirAdminRequest.create({
    data: { type: args.type, payload: args.payload, studentId: args.studentId ?? null, requestedBy: args.actorUserId },
    select: { id: true },
  });
  await emitEvent(db, { type: "MUDDAKIR_REQUEST_CREATED", subjectType: "MuddakirAdminRequest", subjectId: r.id, actorId: args.actorUserId, payload: { type: args.type } });
  return r;
}

/**
 * ينفّذ طلباً موافَقاً عليه بالدالّة المباشرة نفسها التي ينفّذها المدير. تُفتَح هذه الدوالّ معاملاتها
 * الخاصّة، فيُمرَّر إليها العميل الكامل لا معاملةً متداخلة (لا تداخل معاملات). الحجز الذرّيّ في
 * decideRequest هو ما يمنع التنفيذ مرّتين.
 */
async function executeRequest(db: PrismaClient, type: MuddakirRequestType, payload: Record<string, unknown>, executorId: string): Promise<void> {
  switch (type) {
    case MuddakirRequestType.ENROLL: {
      if (typeof payload.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");
      const deliveryMode = payload.deliveryMode === MuddakirDeliveryMode.REMOTE ? MuddakirDeliveryMode.REMOTE : MuddakirDeliveryMode.IN_PERSON;
      await enrollInMuddakir({ studentId: payload.studentId, actorId: executorId, deliveryMode }, db);
      return;
    }
    case MuddakirRequestType.ASSIGN_SUPERVISOR: {
      if (typeof payload.studentId !== "string" || typeof payload.supervisorId !== "string") throw new ValidationError("الحافظ والمشرف مطلوبان.");
      await assignSupervisor({ studentId: payload.studentId, supervisorId: payload.supervisorId, actorId: executorId }, db);
      return;
    }
    case MuddakirRequestType.SET_MODE: {
      if (typeof payload.studentId !== "string" || (payload.mode !== "ACTIVE" && payload.mode !== "REVIEW_ONLY")) throw new ValidationError("الحافظ والوضع مطلوبان.");
      await setStageMode({ actorUserId: executorId, studentId: payload.studentId, mode: payload.mode }, db);
      return;
    }
    case MuddakirRequestType.SET_SETTING: {
      if (typeof payload.key !== "string" || payload.value === undefined) throw new ValidationError("المفتاح والقيمة مطلوبان.");
      await setMuddakirSetting(payload.key, payload.value as Prisma.InputJsonValue, executorId, db);
      return;
    }
    case MuddakirRequestType.SET_TATHBIT_LADDER: {
      if (typeof payload.degreeNo !== "number" || typeof payload.patch !== "object" || payload.patch == null) throw new ValidationError("الدرجة والتعديل مطلوبان.");
      await setTathbitDegree(payload.degreeNo, payload.patch as { dailyJuz?: number; khatmaDays?: number; khatmaCount?: number; active?: boolean }, executorId, db);
      return;
    }
    case MuddakirRequestType.SET_POINT_ITEM: {
      if (typeof payload.nameAr !== "string" || typeof payload.value !== "number" || typeof payload.eventType !== "string") throw new ValidationError("بيانات البند مطلوبة.");
      await setMuddakirPointItem({ id: typeof payload.id === "string" ? payload.id : undefined, nameAr: payload.nameAr, value: payload.value, eventType: payload.eventType as AutoEventType, active: payload.active as boolean | undefined }, executorId, db);
      return;
    }
    default:
      throw new ValidationError("نوع طلبٍ غير منفَّذٍ بعد.");
  }
}

/**
 * يبتّ طلباً (مدير البرنامج): موافقةٌ (تنفيذٌ مرّةً واحدة بالدالّة المباشرة نفسها) أو رفضٌ بسبب.
 *
 * الحجز الذرّيّ: `UPDATE … WHERE status='PENDING'` ينقل صفّاً واحداً فقط؛ فإن كان العدد صفراً فقد بُتّ
 * الطلب (أو أُلغي) فيُرفَض. وبذلك لا يُبتّ/يُنفَّذ الطلب مرّتين حتى مع موافقتين متزامنتين. ثمّ يُنفَّذ
 * **خارج أيّ معاملةٍ متداخلة** (الدوالّ المباشرة تفتح معاملاتها). وإن فشل التنفيذ أُعيد الطلب إلى
 * PENDING وسُجِّل الخطأ، فلا يبقى موافَقاً بلا تنفيذ.
 */
export async function decideRequest(args: { actorUserId: string; requestId: string; decision: "APPROVED" | "REJECTED"; reason?: string }, db: PrismaClient = prisma): Promise<{ status: MuddakirRequestStatus }> {
  const actor = await db.user.findUnique({ where: { id: args.actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!(await muddakirCaps(db, { id: args.actorUserId, roles: actor.roles })).manage) throw new AuthorizationError("البتّ لمدير البرنامج (أو مدير المنصّة).");
  if (args.decision === "REJECTED" && !args.reason?.trim()) throw new ValidationError("سبب الرفض مطلوب.");

  const now = new Date();
  const nextStatus = args.decision === "APPROVED" ? MuddakirRequestStatus.APPROVED : MuddakirRequestStatus.REJECTED;
  // حجزٌ ذرّيّ: صفٌّ واحدٌ معلّقٌ فقط ينتقل — فلا يُبتّ/يُنفَّذ مرّتين (حتى مع موافقتين متزامنتين).
  const claim = await db.muddakirAdminRequest.updateMany({
    where: { id: args.requestId, status: MuddakirRequestStatus.PENDING },
    data: { status: nextStatus, decidedBy: args.actorUserId, decidedAt: now, decisionReason: args.decision === "REJECTED" ? args.reason!.trim() : null },
  });
  if (claim.count !== 1) throw new ValidationError("الطلب ليس معلّقاً (بُتّ أو أُلغي).");

  if (args.decision === "APPROVED") {
    try {
      const req = await db.muddakirAdminRequest.findUniqueOrThrow({ where: { id: args.requestId }, select: { type: true, payload: true } });
      await executeRequest(db, req.type, (req.payload ?? {}) as Record<string, unknown>, args.actorUserId);
      await db.muddakirAdminRequest.update({ where: { id: args.requestId }, data: { executedAt: now } });
    } catch (e) {
      // فشل التنفيذ: أعِد الطلب معلّقاً (لم يُنفَّذ بعد) وسجّل الخطأ.
      await db.muddakirAdminRequest.updateMany({
        where: { id: args.requestId, status: MuddakirRequestStatus.APPROVED, executedAt: null },
        data: { status: MuddakirRequestStatus.PENDING, decidedBy: null, decidedAt: null },
      });
      await emitEvent(db, { type: "MUDDAKIR_REQUEST_EXEC_FAILED", subjectType: "MuddakirAdminRequest", subjectId: args.requestId, actorId: args.actorUserId, payload: { message: e instanceof Error ? e.message : String(e) } });
      throw e;
    }
  }
  await emitEvent(db, { type: "MUDDAKIR_REQUEST_DECIDED", subjectType: "MuddakirAdminRequest", subjectId: args.requestId, actorId: args.actorUserId, payload: { decision: args.decision } });
  return { status: nextStatus };
}

/** يلغي الإداريّ طلبه المعلّق (قبل البتّ). لصاحبه وحده. */
export async function cancelRequest(args: { actorUserId: string; requestId: string }, db: PrismaClient = prisma): Promise<{ cancelled: boolean }> {
  const r = await db.muddakirAdminRequest.updateMany({
    where: { id: args.requestId, requestedBy: args.actorUserId, status: MuddakirRequestStatus.PENDING },
    data: { status: MuddakirRequestStatus.CANCELLED },
  });
  if (r.count !== 1) throw new ValidationError("لا طلبٌ معلّقٌ لك بهذا المعرّف.");
  return { cancelled: true };
}

export interface RequestRow { id: string; type: MuddakirRequestType; payload: unknown; studentId: string | null; requestedBy: string; requestedAt: Date; status: MuddakirRequestStatus; decisionReason: string | null }

const toRow = (r: { id: string; type: MuddakirRequestType; payload: Prisma.JsonValue; studentId: string | null; requestedBy: string; requestedAt: Date; status: MuddakirRequestStatus; decisionReason: string | null }): RequestRow => r;

/** الطلبات المعلّقة (صندوق المدير). */
export async function listPendingRequests(db: PrismaClient = prisma): Promise<RequestRow[]> {
  const rows = await db.muddakirAdminRequest.findMany({ where: { status: MuddakirRequestStatus.PENDING }, orderBy: { requestedAt: "asc" } });
  return rows.map(toRow);
}

/** طلبات الإداريّ نفسه (حالتها). */
export async function listMyRequests(actorUserId: string, db: PrismaClient = prisma): Promise<RequestRow[]> {
  const rows = await db.muddakirAdminRequest.findMany({ where: { requestedBy: actorUserId }, orderBy: { requestedAt: "desc" }, take: 100 });
  return rows.map(toRow);
}

/**
 * ينفّذ الإجراء مباشرةً إن كان الفاعل مديراً، أو يُنشئ طلباً معلّقاً إن كان إداريّاً. يرمي إن لم يكن
 * أحدَهما. (يستعمله مسار الإجراءات الإداريّة فيتفرّع بلا تكرار.)
 */
export async function performOrRequest<T>(
  actor: MuddakirActor,
  spec: { type: MuddakirRequestType; payload: Prisma.InputJsonValue; studentId?: string; direct: () => Promise<T> },
  db: PrismaClient = prisma,
): Promise<{ executed: boolean; requestId?: string; result?: T }> {
  if (actor.caps.manage) return { executed: true, result: await spec.direct() };
  if (actor.caps.admin) { const r = await createRequest({ actorUserId: actor.id, type: spec.type, payload: spec.payload, studentId: spec.studentId }, db); return { executed: false, requestId: r.id }; }
  throw new AuthorizationError("هذا الإجراء لمدير البرنامج أو الإداريّ.");
}
