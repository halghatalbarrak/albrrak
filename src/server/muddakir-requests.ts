import { MuddakirDeliveryMode, MuddakirRequestStatus, MuddakirRequestType, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { emitEvent } from "./events";
import { AuthorizationError, ValidationError } from "./errors";
import { muddakirCaps, type MuddakirActor } from "./muddakir-staff";
import { enrollInMuddakir, assignSupervisor } from "./muddakir-enrollment";
import { setStageMode } from "./muddakir-stages";

// ═══════════════ طلبات الإداريّ (§٢، و٢) ═══════════════
//
// الإداريّ يطّلع بلا موافقة، وكلّ إجراءٍ يغيّر شيئاً يُنشئ طلباً معلّقاً. مدير البرنامج يوافق
// (فيُنفَّذ **بالدالّة نفسها** التي ينفّذها مباشرةً، داخل معاملة، مرّةً واحدة) أو يرفض بسبب. ويلغي
// الإداريّ طلبه المعلّق. append-only (لا حذف، لا تعديل بعد الإرسال).

type Tx = Prisma.TransactionClient;

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

/** ينفّذ طلباً موافَقاً عليه بالدالّة نفسها التي ينفّذها المدير مباشرة (داخل المعاملة). */
async function executeRequest(tx: Tx, type: MuddakirRequestType, payload: Record<string, unknown>, executorId: string): Promise<void> {
  switch (type) {
    case MuddakirRequestType.ENROLL: {
      if (typeof payload.studentId !== "string") throw new ValidationError("الحافظ مطلوب.");
      const deliveryMode = payload.deliveryMode === MuddakirDeliveryMode.REMOTE ? MuddakirDeliveryMode.REMOTE : MuddakirDeliveryMode.IN_PERSON;
      await enrollInMuddakir({ studentId: payload.studentId, actorId: executorId, deliveryMode }, tx as unknown as PrismaClient);
      return;
    }
    case MuddakirRequestType.ASSIGN_SUPERVISOR: {
      if (typeof payload.studentId !== "string" || typeof payload.supervisorId !== "string") throw new ValidationError("الحافظ والمشرف مطلوبان.");
      await assignSupervisor({ studentId: payload.studentId, supervisorId: payload.supervisorId, actorId: executorId }, tx as unknown as PrismaClient);
      return;
    }
    case MuddakirRequestType.SET_MODE: {
      if (typeof payload.studentId !== "string" || (payload.mode !== "ACTIVE" && payload.mode !== "REVIEW_ONLY")) throw new ValidationError("الحافظ والوضع مطلوبان.");
      await setStageMode({ actorUserId: executorId, studentId: payload.studentId, mode: payload.mode }, tx as unknown as PrismaClient);
      return;
    }
    // SET_SETTING / SET_TATHBIT_LADDER / SET_POINT_ITEM تُنفَّذ في و٣.
    default:
      throw new ValidationError("نوع طلبٍ غير منفَّذٍ بعد.");
  }
}

/**
 * يبتّ طلباً (مدير البرنامج): موافقةٌ (تنفيذٌ مرّةً واحدة بالدالّة نفسها) أو رفضٌ بسبب. المطالبة
 * الذرّيّة (PENDING→قرار) تمنع التنفيذ مرّتين، والتنفيذ داخل المعاملة نفسها.
 */
export async function decideRequest(args: { actorUserId: string; requestId: string; decision: "APPROVED" | "REJECTED"; reason?: string }, db: PrismaClient = prisma): Promise<{ status: MuddakirRequestStatus }> {
  const actor = await db.user.findUnique({ where: { id: args.actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!(await muddakirCaps(db, { id: args.actorUserId, roles: actor.roles })).manage) throw new AuthorizationError("البتّ لمدير البرنامج (أو مدير المنصّة).");
  if (args.decision === "REJECTED" && !args.reason?.trim()) throw new ValidationError("سبب الرفض مطلوب.");

  const now = new Date();
  return db.$transaction(async (tx) => {
    const nextStatus = args.decision === "APPROVED" ? MuddakirRequestStatus.APPROVED : MuddakirRequestStatus.REJECTED;
    // مطالبةٌ ذرّيّة: ينجح واحدٌ فقط على طلبٍ معلّق — فلا يُبتّ/يُنفَّذ مرّتين.
    const claim = await tx.muddakirAdminRequest.updateMany({
      where: { id: args.requestId, status: MuddakirRequestStatus.PENDING },
      data: { status: nextStatus, decidedBy: args.actorUserId, decidedAt: now, decisionReason: args.decision === "REJECTED" ? args.reason!.trim() : null },
    });
    if (claim.count !== 1) throw new ValidationError("الطلب ليس معلّقاً (بُتّ أو أُلغي).");
    if (args.decision === "APPROVED") {
      const req = await tx.muddakirAdminRequest.findUniqueOrThrow({ where: { id: args.requestId }, select: { type: true, payload: true } });
      await executeRequest(tx, req.type, (req.payload ?? {}) as Record<string, unknown>, args.actorUserId);
      await tx.muddakirAdminRequest.update({ where: { id: args.requestId }, data: { executedAt: now } });
    }
    await emitEvent(tx, { type: "MUDDAKIR_REQUEST_DECIDED", subjectType: "MuddakirAdminRequest", subjectId: args.requestId, actorId: args.actorUserId, payload: { decision: args.decision } });
    return { status: nextStatus };
  });
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
