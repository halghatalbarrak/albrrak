import { randomUUID } from "node:crypto";

import {
  CertificateTemplate,
  MuddakirErrorSource,
  MuddakirFaceState,
  MuddakirMode,
  MuddakirPhase,
  MuddakirRecitationKind,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  deriveStages,
  juzBoundsFromHizb,
  makkahDayDate,
  type HizbRow,
  type MushafFaceData,
  type StageBound,
} from "@/lib/muddakir";

import { emitEvent } from "./events";
import { getWardView, recordTathbitFinal } from "./muddakir-ward";
import { isExaminerCapable } from "./muddakir-staff";
import { assertCanExamine, canExamine } from "./examiner-eligibility";
import { AuthorizationError, ValidationError } from "./errors";
import { getProgramSetting } from "./settings";
import { muddakirProgramId } from "./muddakir-profile";
import { dateVal } from "./muddakir-day";

// ═══════════════ المُدَّكِر — ختام المرحلة والسرد والتخرّج (المرحلة ٧، §١/§٢/§٧) ═══════════════
//
// اكتمال المرحلة: حين تُحفظ كل أوجه المرحلة (حدود deriveStages بالصفحات، §١) يظهر «جاهزٌ لسرد
// المرحلة». السرد: مختبِرٌ (RECITER يعيّنه المدير) يسجّل النتيجة ومواضع الأخطاء (تدخل علاج الأخطاء
// بمصدر EXAMINER). الاجتياز: شهادة المرحلة (MUDDAKIR_STAGE) وانتقال currentStageId، ونقاط
// MUDDAKIR_STAGE_COMPLETE تُضاف لدفعة تأكيد الأسبوع (لا منح فوريّ). عدم الاجتياز: يبقى ويعالج ثم
// يُعاد السرد. بعد المرحلة السادسة: سردٌ ختاميّ (FINAL) ثمّ شهادة البرنامج (MUDDAKIR_KHATM).

type Db = PrismaClient | Prisma.TransactionClient;

const MANAGE_ROLES: readonly Role[] = [Role.SUPER_ADMIN, Role.CIRCLE_MANAGER];
const LAST_STAGE = 6; // ستّ مراحل (§١) — حدٌّ أعلى للانتقال

function isManager(roles: readonly Role[]): boolean {
  return roles.some((r) => MANAGE_ROLES.includes(r));
}

// ── حدود المراحل (مشتقّةٌ من بيانات المصحف، §١) ──

async function loadStages(db: Db, programId: string): Promise<StageBound[]> {
  const juzSetting = await getProgramSetting(programId, "stageJuzCount", db as PrismaClient);
  const juzCount = typeof juzSetting === "number" && juzSetting > 0 ? juzSetting : 5;
  const hizb = (await db.hizbBoundary.findMany()) as unknown as HizbRow[];
  const mushaf = (await db.mushafFace.findMany({ select: { page: true, fromSurah: true, fromAyah: true, toSurah: true, toAyah: true } })) as MushafFaceData[];
  if (!hizb.length || !mushaf.length) throw new ValidationError("بيانات المصحف/الأحزاب غير مبذورة.");
  return deriveStages(mushaf, juzCount, juzBoundsFromHizb(hizb));
}

// ── حالة ختام المرحلة لحافظ ──

export interface StageProgress {
  stage: number;          // المرحلة الحاليّة (١..٦)
  startPage: number;
  endPage: number;
  memorized: number;      // أوجهٌ حُفظت من المرحلة (state ≠ NEW)
  total: number;          // أوجه المرحلة كلّها
  ready: boolean;         // كل أوجه المرحلة حُفظت ⟵ جاهزٌ لسرد المرحلة
  mode: MuddakirMode;
  awaitingFinal: boolean; // اجتاز السادسة ⟵ جاهزٌ للسرد الختاميّ
  graduated: boolean;     // اجتاز السرد الختاميّ ⟵ شهادة البرنامج
}

async function stagePassed(db: Db, studentId: string, stage: number): Promise<boolean> {
  const r = await db.muddakirRecitation.findFirst({ where: { studentId, kind: MuddakirRecitationKind.STAGE, stage, passed: true }, select: { id: true } });
  return r != null;
}
async function finalPassed(db: Db, studentId: string): Promise<boolean> {
  const r = await db.muddakirRecitation.findFirst({ where: { studentId, kind: MuddakirRecitationKind.FINAL, passed: true }, select: { id: true } });
  return r != null;
}

/** حالة ختام المرحلة الحاليّة لحافظ (§١): الحدود، كم حُفظ، وهل جاهزٌ للسرد/الختاميّ/متخرّج. */
export async function getStageProgress(studentId: string, db: PrismaClient = prisma): Promise<StageProgress> {
  const profile = await db.muddakirProfile.findUnique({ where: { studentId } });
  if (!profile) throw new ValidationError("الحافظ غير ملتحقٍ بالمُدَّكِر.");
  const programId = await muddakirProgramId(db);
  const stages = await loadStages(db, programId);
  const stage = Math.min(LAST_STAGE, Math.max(1, Number(profile.currentStageId ?? "1") || 1));
  const s = stages[stage - 1];
  const memorized = await db.muddakirFace.count({ where: { studentId, page: { gte: s.startPage, lte: s.endPage }, state: { not: MuddakirFaceState.NEW } } });
  const total = s.endPage - s.startPage + 1;
  const sixPassed = await stagePassed(db, studentId, LAST_STAGE);
  const graduated = await finalPassed(db, studentId);
  const ready = memorized >= total && !(await stagePassed(db, studentId, stage));
  return {
    stage, startPage: s.startPage, endPage: s.endPage, memorized, total,
    ready, mode: profile.mode,
    awaitingFinal: sixPassed && !graduated,
    graduated,
  };
}

// ── تسجيل السرد (المختبِر) ──

export interface RecitationErrorInput { page: number; lineNo: number }
export interface RecordRecitationArgs {
  examinerUserId: string;
  studentId: string;
  passed: boolean;
  errors?: RecitationErrorInput[];
}
export interface RecordRecitationResult {
  recitationId: string;
  kind: MuddakirRecitationKind;
  stage: number;
  passed: boolean;
  certificateId: string | null;
  nextStage: number | null; // المرحلة التالية إن انتقل، أو null
  graduated: boolean;
}

/** يتحقّق أنّ الفاعل مختبِرٌ مؤهّل (RECITER، أو مختبِرُ مدّكرٍ مُسنَد، أو مديرٌ) وليس معلّمَ الحافظ ولا عريفَ حلقته. */
async function assertExaminer(db: Db, examinerUserId: string, studentId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: examinerUserId }, select: { id: true } });
  if (!user) throw new AuthorizationError("مستخدم غير موجود.");
  if (!(await isExaminerCapable(db, examinerUserId))) throw new AuthorizationError("السرد يسجّله المختبِر (المُسمِّع).");
  await assertCanExamine({ examinerUserId, studentId }, db as PrismaClient);
}

async function recordExaminerErrors(db: Db, studentId: string, examinerUserId: string, errors: RecitationErrorInput[], today: string): Promise<void> {
  for (const e of errors) {
    if (!Number.isInteger(e.page) || !Number.isInteger(e.lineNo)) throw new ValidationError("موضعٌ غير صالح.");
    const line = await db.mushafLine.findUnique({ where: { page_lineNo: { page: e.page, lineNo: e.lineNo } }, select: { page: true } });
    if (!line) throw new ValidationError(`موضعٌ غير موجودٍ في المصحف: ${e.page}/${e.lineNo}.`);
    const exists = await db.muddakirError.findFirst({ where: { studentId, page: e.page, lineNo: e.lineNo, resolvedAt: null }, select: { id: true } });
    if (!exists) {
      await db.muddakirError.create({ data: { studentId, page: e.page, lineNo: e.lineNo, source: MuddakirErrorSource.EXAMINER, openedOn: dateVal(today), recordedById: examinerUserId } });
    }
  }
}

/**
 * يسجّل المختبِر نتيجة السرد (§٧): يحدّد نوعه (سرد المرحلة الحاليّة، أو الختاميّ إن اجتاز السادسة).
 * الأخطاء تدخل علاج الأخطاء بمصدر EXAMINER. الاجتياز يُصدِر الشهادة وينقل المرحلة (لا منح نقاطٍ
 * فوريّ — MUDDAKIR_STAGE_COMPLETE يدخل دفعة تأكيد الأسبوع). عدم الاجتياز: يبقى ويعالج.
 */
export async function recordStageRecitation(args: RecordRecitationArgs, db: PrismaClient = prisma, now: Date = new Date()): Promise<RecordRecitationResult> {
  await assertExaminer(db, args.examinerUserId, args.studentId);
  const progress = await getStageProgress(args.studentId, db);
  const today = makkahDayDate(now);
  const errors = args.errors ?? [];

  const kind = progress.awaitingFinal ? MuddakirRecitationKind.FINAL : MuddakirRecitationKind.STAGE;
  if (progress.graduated) throw new ValidationError("الحافظ متخرّجٌ فعلاً.");
  if (kind === MuddakirRecitationKind.STAGE) {
    if (args.passed && !progress.ready) throw new ValidationError("لم تُحفظ كل أوجه المرحلة بعد — لا يصحّ تسجيل الاجتياز.");
    if (await stagePassed(db, args.studentId, progress.stage)) throw new ValidationError("المرحلة مُجتازةٌ فعلاً.");
  }

  return db.$transaction(async (tx) => {
    // مواضع الأخطاء ← علاج الأخطاء (مصدر EXAMINER) — في الحالين (اجتاز أو لم يجتز).
    await recordExaminerErrors(tx, args.studentId, args.examinerUserId, errors, today);

    let certificateId: string | null = null;
    let nextStage: number | null = null;
    let graduated = false;

    if (args.passed) {
      const template = kind === MuddakirRecitationKind.FINAL ? CertificateTemplate.MUDDAKIR_KHATM : CertificateTemplate.MUDDAKIR_STAGE;
      const cert = await tx.certificate.create({
        data: { studentId: args.studentId, template, verifyToken: randomUUID(), stageId: String(progress.stage) },
        select: { id: true },
      });
      certificateId = cert.id;
      if (kind === MuddakirRecitationKind.STAGE && progress.stage < LAST_STAGE) {
        nextStage = progress.stage + 1;
        await tx.muddakirProfile.update({ where: { studentId: args.studentId }, data: { currentStageId: String(nextStage) } });
      }
      if (kind === MuddakirRecitationKind.FINAL) {
        graduated = true;
        // التخرّج من الحفظ ⟵ الدخول في طور التثبيت من الدرجة ١ (§١٢).
        await tx.muddakirProfile.update({
          where: { studentId: args.studentId },
          data: { phase: MuddakirPhase.TATHBIT, tathbitDegree: 1, khatmaInDegree: 0, wardsCompleted: 0 },
        });
      }
    }

    const rec = await tx.muddakirRecitation.create({
      data: { studentId: args.studentId, kind, stage: progress.stage, passed: args.passed, examinerId: args.examinerUserId, certificateId, recitedOn: dateVal(today) },
      select: { id: true },
    });

    await emitEvent(tx, {
      type: args.passed ? (graduated ? "MUDDAKIR_GRADUATED" : "MUDDAKIR_STAGE_PASSED") : "MUDDAKIR_RECITATION_FAILED",
      subjectType: "Student",
      subjectId: args.studentId,
      actorId: args.examinerUserId,
      payload: { recitationId: rec.id, kind, stage: progress.stage, certificateId, errors: errors.length },
    });

    return { recitationId: rec.id, kind, stage: progress.stage, passed: args.passed, certificateId, nextStage, graduated };
  });
}

// ── الوقوف عند مرحلة (REVIEW_ONLY) والعودة (ACTIVE) ──

/** المدير أو مشرف الحافظ يحوّل وضعه بين ACTIVE وREVIEW_ONLY (§١ الوقوف عند مرحلة). */
export async function setStageMode(args: { actorUserId: string; studentId: string; mode: MuddakirMode }, db: PrismaClient = prisma): Promise<{ mode: MuddakirMode }> {
  const actor = await db.user.findUnique({ where: { id: args.actorUserId }, select: { roles: true } });
  if (!actor) throw new AuthorizationError("مستخدم غير موجود.");
  if (!isManager(actor.roles)) {
    if (!actor.roles.includes(Role.ARIF)) throw new AuthorizationError("غير مصرَّح.");
    const link = await db.muddakirSupervision.findFirst({ where: { supervisorId: args.actorUserId, studentId: args.studentId, endedAt: null }, select: { id: true } });
    if (!link) throw new AuthorizationError("لا تشرف على هذا الحافظ.");
  }
  if (args.mode !== MuddakirMode.ACTIVE && args.mode !== MuddakirMode.REVIEW_ONLY) throw new ValidationError("وضعٌ غير معروف.");
  await db.muddakirProfile.update({ where: { studentId: args.studentId }, data: { mode: args.mode } });
  await emitEvent(db, { type: "MUDDAKIR_MODE_CHANGED", subjectType: "Student", subjectId: args.studentId, actorId: args.actorUserId, payload: { mode: args.mode } });
  return { mode: args.mode };
}

// ── قائمة المرشّحين للسرد (لشاشة المختبِر) ──

export interface RecitationCandidate { studentId: string; name: string; stage: number; kind: MuddakirRecitationKind }

/** الحفّاظ الجاهزون لسردٍ (مرحلةٍ، أو ختاميّ للحفظ، أو ختاميّ للتثبيت) ممّن يجوز لهذا المختبِر اختبارهم. */
export async function listRecitationCandidates(examinerUserId: string, db: PrismaClient = prisma): Promise<RecitationCandidate[]> {
  const examiner = await db.user.findUnique({ where: { id: examinerUserId }, select: { id: true } });
  if (!examiner || !(await isExaminerCapable(db, examinerUserId))) throw new AuthorizationError("هذه الشاشة للمختبِر.");
  const profiles = await db.muddakirProfile.findMany({ select: { studentId: true, phase: true } });
  const out: Omit<RecitationCandidate, "name">[] = [];
  for (const p of profiles) {
    let kind: MuddakirRecitationKind | null = null;
    let stage = 0;
    if (p.phase === "TATHBIT") {
      // جاهزٌ للسرد الختاميّ للتثبيت = أتمّ الدرجة العاشرة ولم يُجتَز سردُه الختاميّ بعد.
      const v = await getWardView(p.studentId, db, new Date());
      if (!v.finishedLadder) continue;
      if (await db.muddakirRecitation.findFirst({ where: { studentId: p.studentId, kind: MuddakirRecitationKind.TATHBIT_FINAL, passed: true }, select: { id: true } })) continue;
      kind = MuddakirRecitationKind.TATHBIT_FINAL; stage = 10;
    } else {
      let progress: StageProgress;
      try { progress = await getStageProgress(p.studentId, db); } catch { continue; }
      if (progress.graduated) continue;
      kind = progress.awaitingFinal ? MuddakirRecitationKind.FINAL : (progress.ready ? MuddakirRecitationKind.STAGE : null);
      stage = progress.stage;
    }
    if (!kind) continue;
    if (!(await canExamine({ examinerUserId, studentId: p.studentId }, db))) continue;
    out.push({ studentId: p.studentId, kind, stage });
  }
  const names = await db.student.findMany({ where: { id: { in: out.map((o) => o.studentId) } }, select: { id: true, user: { select: { nameAsInId: true } } } });
  const nameBy = new Map(names.map((n) => [n.id, n.user.nameAsInId]));
  return out.map((o) => ({ ...o, name: nameBy.get(o.studentId) ?? "—" })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** يوزّع تسجيل السرد بحسب طور الحافظ: التثبيت المنتهي ⟵ السرد الختاميّ للتثبيت؛ وإلّا سرد الحفظ. */
export async function recordRecitation(
  args: { examinerUserId: string; studentId: string; passed: boolean; errors?: RecitationErrorInput[] },
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<{ tathbitFinal: boolean; passed: boolean; recitationId: string }> {
  const prof = await db.muddakirProfile.findUnique({ where: { studentId: args.studentId }, select: { phase: true } });
  if (prof?.phase === "TATHBIT") {
    const v = await getWardView(args.studentId, db, now);
    if (v.finishedLadder) {
      const r = await recordTathbitFinal(args, db, now);
      return { tathbitFinal: true, passed: r.passed, recitationId: r.recitationId };
    }
  }
  const r = await recordStageRecitation(args, db, now);
  return { tathbitFinal: false, passed: r.passed, recitationId: r.recitationId };
}
