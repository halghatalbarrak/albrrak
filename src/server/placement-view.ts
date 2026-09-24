import { ProgramKey, StageKind, ProgressState, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveStudentProgram } from "./program-placement";
import { assertCanPlace, type OutOfOrderRange } from "./placement-actions";

// عرضٌ للقراءة لشاشة التسكين (ق٢/ق٣/ق٧): برنامج الطالب الحاليّ + المعلّق + قائمة البرامج،
// ودروس القاعدة (لتسكينها) أو تسكين مراقي الحاليّ. مؤمَّنٌ بحارس التسكين.

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface PlacementView {
  studentName: string;
  programKey: ProgramKey | null;
  pending: { programKey: ProgramKey; from: string } | null;
  programs: { id: string; key: ProgramKey; nameAr: string }[];
  qaidah: { currentLessonId: string | null; lessons: { id: string; nameAr: string; chapterName: string | null }[] } | null;
  maraqi: { reachedSurah: number | null; reachedAyah: number | null; outOfOrder: OutOfOrderRange[] } | null;
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

  const base: PlacementView = {
    studentName: student?.user.nameAsInId ?? "",
    programKey: view.programKey,
    pending: view.pending ? { programKey: view.pending.programKey, from: iso(view.pending.from) } : null,
    programs,
    qaidah: null,
    maraqi: null,
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
