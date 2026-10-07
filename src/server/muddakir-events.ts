import { MuddakirErrorSource, type Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { makkahDayDate } from "@/lib/muddakir";

import { AuthorizationError, ValidationError } from "./errors";
import { deriveDay, recomputeTreatmentAndWeak } from "./muddakir-day";
import { deriveWard } from "./muddakir-ward";

// ═══════════════ استقبال أحداث المُدَّكِر (المرحلة ٤، §٨) ═══════════════
//
// الجهاز يرسل دفعة أحداثٍ كلٌّ بـclientEventId يولّده الجهاز، فالإرسال **idempotent**: المكرّر
// يُتجاهل بلا خطأ (قيد clientEventId الفريد). يومُ الحدث يُحسب في الخادم بتوقيت مكّة من occurredAt
// (لا من الجهاز) — فإتمامٌ ضُغط قبل منتصف الليل يُحسب ليومه ولو وصل بعده. ثمّ يُعاد اشتقاق أيّامه.

// مفردات الأحداث التي يشتقّها المحرّك (المرحلة ٤). علاج الأخطاء والتسميع في مراحل لاحقة.
export const MUDDAKIR_EVENT_TYPES = [
  "NEW_REP", "NEW_ERROR", "NEW_UNDO", // تكرار الجديد وأخطاؤه وتراجعه (§٤٫١)
  "YESTERDAY_REP",                     // تكرار الأمس (§٤٫١)
  "RIBAT_DONE", "REVIEW_DONE",         // إنجاز ركنَي الربط والمراجعة (§٤)
  "ERROR_OPEN",                        // تسجيل موضع خطأ: الصفحة + السطر (§٤٫٤)
  "TREATMENT_REP",                     // تكرار سطرَي العلاج (عدّادٌ محلّيّ؛ قيم §١٠ مفتوحة)
  "EXCUSE",                            // عذرٌ (§٥) — يوقف الجديد وحده
  "DAY_COMPLETE",                      // إتمام اليوم (§٥)
  "MAKEUP_COMPLETE",                   // قضاء يومٍ سابقٍ في غده (§٥)
  "TRACK_CHANGE_REQUEST",              // طلب الحافظ تغيير مساره (§٤٫١) — يُقرّه المشرف (المرحلة ٦)
  "WARD_COMPLETE",                     // إتمام وردٍ في التثبيت/الدائم (§١٢) — مؤشّر الورد
] as const;
export type MuddakirEventType = (typeof MUDDAKIR_EVENT_TYPES)[number];
const KNOWN = new Set<string>(MUDDAKIR_EVENT_TYPES);

export interface DeviceEvent {
  clientEventId: string;
  type: string;
  occurredAt: string; // وقت الجهاز (ISO)
  payload?: Record<string, unknown> | null;
  studentId?: string; // اختياريّ — يُتحقَّق أنّه يخصّ الحافظ نفسه إن ورد
}

export interface IngestResult {
  accepted: number;   // أحداثٌ جديدةٌ خُزّنت
  duplicates: number; // مكرّرةٌ تُجوهلت بلا خطأ
  days: string[];     // الأيّام التي أُعيد اشتقاقها
}

const dateVal = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * يستقبل دفعة أحداثٍ لحافظٍ واحد (الفاعل نفسه). idempotent على clientEventId. يتحقّق أنّ الأحداث
 * تخصّ الحافظ نفسه (الفاعل = صاحب الطالب)، ثمّ يُعيد اشتقاق كلّ يومٍ تأثّر.
 */
export async function ingestEvents(
  args: { actorUserId: string; events: DeviceEvent[]; studentId?: string },
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<IngestResult> {
  // ملكيّة: الفاعل هو الحافظ (الطالب صاحب هذا المستخدم) — §١.
  const student = await db.student.findUnique({ where: { userId: args.actorUserId }, select: { id: true } });
  if (!student) throw new AuthorizationError("لا حافظٌ مرتبطٌ بهذا المستخدم.");
  const studentId = args.studentId ?? student.id;
  if (studentId !== student.id) throw new AuthorizationError("الأحداث لا تخصّ الحافظ نفسه.");
  const profile = await db.muddakirProfile.findUnique({ where: { studentId }, select: { studentId: true } });
  if (!profile) throw new ValidationError("الحافظ غير ملتحقٍ بالمُدَّكِر.");

  if (!Array.isArray(args.events) || args.events.length === 0) throw new ValidationError("لا أحداث.");

  const rows: Prisma.MuddakirEventCreateManyInput[] = [];
  const affected = new Set<string>();
  const errorOpens: { page: number; lineNo: number; source: MuddakirErrorSource; dayStr: string }[] = [];
  for (const e of args.events) {
    if (typeof e.clientEventId !== "string" || !e.clientEventId) throw new ValidationError("clientEventId مطلوب.");
    if (!KNOWN.has(e.type)) throw new ValidationError(`نوع حدثٍ غير معروف: ${e.type}`);
    const occurredAt = new Date(e.occurredAt);
    if (isNaN(occurredAt.getTime())) throw new ValidationError("occurredAt غير صالح.");
    if (e.studentId && e.studentId !== studentId) throw new AuthorizationError("حدثٌ لا يخصّ الحافظ نفسه.");
    const dayStr = makkahDayDate(occurredAt); // يومُ مكّة في الخادم — المرجع
    affected.add(dayStr);
    if (e.type === "MAKEUP_COMPLETE") {
      const d = e.payload?.makeupForDate;
      if (typeof d === "string") affected.add(d); // أعِد تقييم اليوم المقضيّ
    }
    if (e.type === "ERROR_OPEN") {
      const page = e.payload?.page, lineNo = e.payload?.lineNo;
      const srcRaw = e.payload?.source;
      const source = typeof srcRaw === "string" && srcRaw in MuddakirErrorSource ? (srcRaw as MuddakirErrorSource) : MuddakirErrorSource.RIBAT;
      if (typeof page === "number" && typeof lineNo === "number") errorOpens.push({ page, lineNo, source, dayStr });
    }
    rows.push({
      clientEventId: e.clientEventId, studentId, dayDate: dateVal(dayStr),
      type: e.type, payload: (e.payload ?? undefined) as Prisma.InputJsonValue | undefined, occurredAt,
    });
  }

  // إدراجٌ idempotent: المكرّر على clientEventId يُتجاهل بلا خطأ.
  const res = await db.muddakirEvent.createMany({ data: rows, skipDuplicates: true });
  const accepted = res.count;

  // فتح مواضع الأخطاء (§٤٫٤) — idempotent: لا يُكرَّر موضعٌ مفتوحٌ في نفس (الصفحة، السطر).
  for (const o of errorOpens) {
    const exists = await db.muddakirError.findFirst({ where: { studentId, page: o.page, lineNo: o.lineNo, resolvedAt: null }, select: { id: true } });
    if (!exists) {
      await db.muddakirError.create({ data: { studentId, page: o.page, lineNo: o.lineNo, source: o.source, openedOn: dateVal(o.dayStr), recordedById: args.actorUserId } });
    }
  }

  // اشتقاق كلّ يومٍ تأثّر **تنازليًّا** (الغد قبل أمسِه): فيوجد سجلّ يوم القضاء قبل تقييم اليوم
  // المقضيّ، فيُضبط makeupForDayId مع MADE_UP.
  // طور الحافظ يحدّد المحرّك: الحفظ ⟵ محرّك اليوم (الأركان)؛ التثبيت/الدائم ⟵ محرّك الورد (§١٢).
  const phaseRow = await db.muddakirProfile.findUnique({ where: { studentId }, select: { phase: true } });
  if (phaseRow && phaseRow.phase !== "MEMORIZE") {
    await deriveWard(db, studentId, now);
  } else {
    const days = [...affected].sort().reverse();
    for (const d of days) await deriveDay(db, studentId, d, now);
  }

  // علاج الأخطاء ووسم الأوجه الضعيفة: إعادةُ حسابٍ نقيّةٌ (يعمل في الطورين — مواضع REVIEW في التثبيت).
  await recomputeTreatmentAndWeak(db, studentId);

  return { accepted, duplicates: args.events.length - accepted, days: [...affected].sort().reverse() };
}
