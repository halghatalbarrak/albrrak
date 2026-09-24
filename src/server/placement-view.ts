import { ProgramKey, StageKind, ProgressState, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveStudentProgram } from "./program-placement";
import { assertCanPlace, type OutOfOrderRange } from "./placement-actions";

// عرضٌ للقراءة لشاشة التسكين (ق٢/ق٣/ق٧): برنامج الطالب الحاليّ + المعلّق + قائمة البرامج،
// ودروس القاعدة (لتسكينها) أو تسكين مراقي الحاليّ. مؤمَّنٌ بحارس التسكين.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface ProgramHistoryRow {
  program: string;
  enteredAt: string;
  exitedAt: string | null;
  reason: string; // ASSIGNMENT | READING_TEST | GRADUATION | CHANGE
  actor: string | null;
}

export interface PlacementView {
  studentName: string;
  programKey: ProgramKey | null;
  pending: { programKey: ProgramKey; from: string } | null;
  programs: { id: string; key: ProgramKey; nameAr: string }[];
  qaidah: { currentLessonId: string | null; lessons: { id: string; nameAr: string; chapterName: string | null }[] } | null;
  maraqi: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: OutOfOrderRange[] } | null;
  history: ProgramHistoryRow[];
}

function parseOoo(raw: unknown): OutOfOrderRange[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is OutOfOrderRange => {
    const o = r as Record<string, unknown>;
    return [o.fromSurah, o.fromAyah, o.toSurah, o.toAyah].every((n) => typeof n === "number");
  });
}

export async function getPlacementView(actorId: string, studentId: string, db: PrismaClient = prisma): Promise<PlacementView> {
  await assertCanPlace(db, actorId);
  const view = await resolveStudentProgram(db, studentId);
  const student = await db.student.findUnique({ where: { id: studentId }, select: { user: { select: { nameAsInId: true } } } });
  const programs = await db.program.findMany({ select: { id: true, key: true, nameAr: true }, orderBy: { key: "asc" } });

  // ق٦: تاريخ البرامج (قراءةٌ فقط) — دخل/خرج/السبب/الفاعل، الأحدث أوّلاً.
  const hist = await db.programEnrollmentHistory.findMany({
    where: { studentId }, orderBy: { enteredAt: "desc" },
    select: { programId: true, enteredAt: true, exitedAt: true, reason: true, actorId: true },
  });
  const progIds = [...new Set(hist.map((h) => h.programId))];
  const actorIds = [...new Set(hist.map((h) => h.actorId).filter((x): x is string => !!x))];
  const [progRows, actorRows] = await Promise.all([
    progIds.length ? db.program.findMany({ where: { id: { in: progIds } }, select: { id: true, nameAr: true } }) : Promise.resolve([]),
    actorIds.length ? db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, nameAsInId: true } }) : Promise.resolve([]),
  ]);
  const progName = new Map(progRows.map((p) => [p.id, p.nameAr]));
  const actorName = new Map(actorRows.map((a) => [a.id, a.nameAsInId]));

  const base: PlacementView = {
    studentName: student?.user.nameAsInId ?? "",
    programKey: view.programKey,
    pending: view.pending ? { programKey: view.pending.programKey, from: iso(view.pending.from) } : null,
    programs,
    qaidah: null,
    maraqi: null,
    history: hist.map((h) => ({
      program: progName.get(h.programId) ?? "—",
      enteredAt: iso(h.enteredAt),
      exitedAt: h.exitedAt ? iso(h.exitedAt) : null,
      reason: h.reason,
      actor: h.actorId ? actorName.get(h.actorId) ?? null : null,
    })),
  };

  if (view.programKey === ProgramKey.QAIDAH_MADANIYYAH) {
    const q = await db.program.findUnique({ where: { key: ProgramKey.QAIDAH_MADANIYYAH }, select: { id: true } });
    const lessons = q
      ? await db.stage.findMany({ where: { programId: q.id, kind: StageKind.LESSON }, orderBy: { ordinal: "asc" }, select: { id: true, nameAr: true, parent: { select: { nameAr: true } } } })
      : [];
    const done = await db.stageProgress.findMany({ where: { studentId, state: ProgressState.COMPLETED, stage: { kind: StageKind.LESSON } }, select: { stageId: true } });
    const doneIds = new Set(done.map((d) => d.stageId));
    base.qaidah = {
      currentLessonId: lessons.find((l) => !doneIds.has(l.id))?.id ?? null,
      lessons: lessons.map((l) => ({ id: l.id, nameAr: l.nameAr, chapterName: l.parent?.nameAr ?? null })),
    };
  } else if (view.programKey === ProgramKey.MARAQI) {
    const p = await db.maraqiPlacement.findUnique({ where: { studentId }, select: { reachedSurah: true, reachedAyah: true, outOfOrder: true } });
    base.maraqi = { reachedSurah: p?.reachedSurah ?? null, reachedAyah: p?.reachedAyah ?? null, outOfOrder: parseOoo(p?.outOfOrder) };
  }
  return base;
}
