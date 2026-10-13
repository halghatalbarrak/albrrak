import { DisplayScheduleContent, DisplayScheduleStart, type DisplaySchedule, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ValidationError } from "@/server/errors";
import { programName } from "@/i18n/ar/gamification";
import { makkahDayBounds, makkahDayDate } from "@/lib/makkah-day";
import {
  hhmmMakkah,
  intervalsOverlap,
  resolveWindow,
  type Prayer,
  type ScheduleDef,
} from "@/lib/display-schedule";
import { madinahPrayerMs, madinahPrayerTimesAdjusted } from "./prayer-times";
import { screenPrayerAdjust } from "./screens";
import { assertDisplayAdmin } from "./guard";

// ═══════════════ جدولة الشاشة بأوقات الصلاة (DISPLAY_SCREEN_RULES §١٠) ═══════════════
//
// لكل شاشة «مواعيد». داخل الموعد: محتواه وحده بالدوران المعتاد. خارجها: الدورة الافتراضيّة.
// الأعلى ترتيباً (ordinal أصغر) يغلب عند التداخل (تحذيرٌ عند الحفظ). append-only: التعطيل لا الحذف.

const PRAYER_AR: Record<Prayer, string> = { FAJR: "الفجر", DHUHR: "الظهر", ASR: "العصر", MAGHRIB: "المغرب", ISHA: "العشاء" };
const PRAYER_VALUES: readonly Prayer[] = ["FAJR", "DHUHR", "ASR", "MAGHRIB", "ISHA"];

/** صفّ Prisma ⟵ تعريف الموعد النقيّ (لـ resolveWindow). */
export function toScheduleDef(r: DisplaySchedule): ScheduleDef {
  return {
    id: r.id,
    ordinal: r.ordinal,
    startMode: r.startMode,
    prayer: r.prayer,
    rel: r.rel,
    offsetMin: r.offsetMin,
    fixedTime: r.fixedTime,
    durationMin: r.durationMin,
    daysMask: r.daysMask,
    active: r.active,
  };
}

export interface ScheduleInput {
  startMode: DisplayScheduleStart;
  prayer?: Prayer | null;
  rel?: "AFTER" | "BEFORE" | null;
  offsetMin?: number;
  fixedTime?: string | null;
  durationMin: number;
  contentMode: DisplayScheduleContent;
  programId?: string | null;
  slideIds?: string[];
  daysMask?: number;
  active?: boolean;
}

/** يتحقّق من المدخلات ويبني بيانات الكتابة (بلا screenId/ordinal). يرمي ValidationError عند الخلل. */
async function validate(screenId: string, input: ScheduleInput, db: PrismaClient): Promise<Record<string, unknown>> {
  if (!Number.isInteger(input.durationMin) || input.durationMin < 1 || input.durationMin > 1440) throw new ValidationError("مدّة الموعد دقائقُ بين ١ و١٤٤٠.");
  const daysMask = input.daysMask ?? 127;
  if (!Number.isInteger(daysMask) || daysMask < 1 || daysMask > 127) throw new ValidationError("أيّام الموعد غير صالحة.");

  const data: Record<string, unknown> = { startMode: input.startMode, durationMin: input.durationMin, contentMode: input.contentMode, daysMask, active: input.active ?? true };

  if (input.startMode === DisplayScheduleStart.PRAYER) {
    if (!input.prayer || !PRAYER_VALUES.includes(input.prayer)) throw new ValidationError("صلاة الموعد مطلوبة.");
    if (input.rel !== "AFTER" && input.rel !== "BEFORE") throw new ValidationError("حدّد: بعد أو قبل الصلاة.");
    const off = input.offsetMin ?? 0;
    if (!Number.isInteger(off) || off < 0 || off > 720) throw new ValidationError("دقائق الإزاحة بين ٠ و٧٢٠.");
    Object.assign(data, { prayer: input.prayer, rel: input.rel, offsetMin: off, fixedTime: null });
  } else if (input.startMode === DisplayScheduleStart.FIXED) {
    const t = (input.fixedTime ?? "").trim();
    const m = /^(\d{2}):(\d{2})$/.exec(t);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ValidationError("الساعة الثابتة بصيغة HH:MM بتوقيت مكّة.");
    Object.assign(data, { fixedTime: t, prayer: null, rel: null, offsetMin: 0 });
  } else {
    throw new ValidationError("نوع بداية الموعد مطلوب.");
  }

  if (input.contentMode === DisplayScheduleContent.PROGRAM) {
    if (typeof input.programId !== "string" || !input.programId) throw new ValidationError("برنامج الموعد مطلوب.");
    if (!(await db.program.findUnique({ where: { id: input.programId }, select: { id: true } }))) throw new ValidationError("برنامجٌ غير موجود.");
    Object.assign(data, { programId: input.programId, slideIds: null });
  } else if (input.contentMode === DisplayScheduleContent.SLIDES) {
    const ids = [...new Set((input.slideIds ?? []).filter((x) => typeof x === "string" && x))];
    if (ids.length === 0) throw new ValidationError("اختر شريحةً واحدةً على الأقلّ.");
    const owned = await db.displaySlide.findMany({ where: { id: { in: ids }, screenId }, select: { id: true } });
    if (owned.length !== ids.length) throw new ValidationError("شريحةٌ مختارةٌ لا تخصّ هذه الشاشة.");
    Object.assign(data, { slideIds: ids.join(","), programId: null });
  } else {
    throw new ValidationError("محتوى الموعد مطلوب.");
  }
  return data;
}

const nextOrdinal = async (screenId: string, db: PrismaClient): Promise<number> => {
  const last = await db.displaySchedule.findFirst({ where: { screenId }, orderBy: { ordinal: "desc" }, select: { ordinal: true } });
  return (last?.ordinal ?? -1) + 1;
};

export async function addSchedule(actorUserId: string, screenId: string, input: ScheduleInput, db: PrismaClient = prisma): Promise<{ id: string; warnings: string[] }> {
  await assertDisplayAdmin(actorUserId, db);
  if (!(await db.displayScreen.findUnique({ where: { id: screenId }, select: { id: true } }))) throw new ValidationError("شاشةٌ غير موجودة.");
  const data = await validate(screenId, input, db);
  const row = await db.displaySchedule.create({ data: { screenId, ordinal: await nextOrdinal(screenId, db), ...data } as never, select: { id: true } });
  return { id: row.id, warnings: await scheduleWarnings(screenId, db) };
}

export async function setSchedule(actorUserId: string, scheduleId: string, input: Partial<ScheduleInput> & { active?: boolean }, db: PrismaClient = prisma): Promise<{ warnings: string[] }> {
  await assertDisplayAdmin(actorUserId, db);
  const cur = await db.displaySchedule.findUnique({ where: { id: scheduleId } });
  if (!cur) throw new ValidationError("موعدٌ غير موجود.");
  // تعديلٌ لمفتاحٍ واحد (التعطيل) أو تعديلٌ كامل. إن غابت الحقول البنيويّة نكتفي بـ active.
  const structural = input.startMode !== undefined || input.contentMode !== undefined || input.durationMin !== undefined || input.daysMask !== undefined || input.prayer !== undefined || input.rel !== undefined || input.offsetMin !== undefined || input.fixedTime !== undefined || input.programId !== undefined || input.slideIds !== undefined;
  if (structural) {
    const merged: ScheduleInput = {
      startMode: input.startMode ?? cur.startMode,
      prayer: (input.prayer ?? cur.prayer) as Prayer | null,
      rel: (input.rel ?? cur.rel) as "AFTER" | "BEFORE" | null,
      offsetMin: input.offsetMin ?? cur.offsetMin,
      fixedTime: input.fixedTime ?? cur.fixedTime,
      durationMin: input.durationMin ?? cur.durationMin,
      contentMode: input.contentMode ?? cur.contentMode,
      programId: input.programId ?? cur.programId,
      slideIds: input.slideIds ?? (cur.slideIds ? cur.slideIds.split(",") : []),
      daysMask: input.daysMask ?? cur.daysMask,
      active: input.active ?? cur.active,
    };
    const data = await validate(cur.screenId, merged, db);
    await db.displaySchedule.update({ where: { id: scheduleId }, data: data as never });
  } else if (input.active !== undefined) {
    await db.displaySchedule.update({ where: { id: scheduleId }, data: { active: input.active } });
  }
  return { warnings: await scheduleWarnings(cur.screenId, db) };
}

/** يرتّب مواعيد شاشةٍ حسب ترتيب المعرّفات (ordinal = الفهرس؛ الأصغر يغلب). */
export async function reorderSchedules(actorUserId: string, screenId: string, orderedIds: string[], db: PrismaClient = prisma): Promise<void> {
  await assertDisplayAdmin(actorUserId, db);
  await db.$transaction(orderedIds.map((id, i) => db.displaySchedule.updateMany({ where: { id, screenId }, data: { ordinal: i } })));
}

export interface ScheduleRow {
  id: string; ordinal: number; startMode: DisplayScheduleStart; prayer: Prayer | null; rel: "AFTER" | "BEFORE" | null;
  offsetMin: number; fixedTime: string | null; durationMin: number; contentMode: DisplayScheduleContent;
  programId: string | null; programNameAr: string | null; slideIds: string[]; daysMask: number; active: boolean;
}

export async function listSchedules(screenId: string, db: PrismaClient = prisma): Promise<ScheduleRow[]> {
  const rows = await db.displaySchedule.findMany({ where: { screenId }, orderBy: { ordinal: "asc" } });
  const keyById = await programKeys(rows, db);
  return rows.map((r) => ({
    id: r.id, ordinal: r.ordinal, startMode: r.startMode, prayer: r.prayer as Prayer | null, rel: r.rel as "AFTER" | "BEFORE" | null,
    offsetMin: r.offsetMin, fixedTime: r.fixedTime, durationMin: r.durationMin, contentMode: r.contentMode,
    programId: r.programId, programNameAr: r.programId ? programName(keyById.get(r.programId) ?? "") : null,
    slideIds: r.slideIds ? r.slideIds.split(",") : [], daysMask: r.daysMask, active: r.active,
  }));
}

async function programKeys(rows: { programId: string | null }[], db: PrismaClient): Promise<Map<string, string>> {
  const ids = [...new Set(rows.filter((r) => r.programId).map((r) => r.programId!))];
  if (!ids.length) return new Map();
  const progs = await db.program.findMany({ where: { id: { in: ids } }, select: { id: true, key: true } });
  return new Map(progs.map((p) => [p.id, p.key]));
}

function contentLabel(r: DisplaySchedule, keyById: Map<string, string>): string {
  if (r.contentMode === DisplayScheduleContent.PROGRAM && r.programId) return programName(keyById.get(r.programId) ?? "");
  const n = r.slideIds ? r.slideIds.split(",").filter(Boolean).length : 0;
  return `شرائح مختارة (${n})`;
}

/** معاينة نصّيّة لمواعيد اليوم (§١٠): «العصر 15:24 ← 15:34–16:04: مراقي». الأرقام تُشرَّق في العرض. */
export async function todayPreview(screenId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<string[]> {
  const dateISO = makkahDayDate(now);
  const adjust = await screenPrayerAdjust(screenId, db);
  const prayers = madinahPrayerTimesAdjusted(dateISO, adjust);
  const prayerMs = madinahPrayerMs(dateISO, adjust);
  const mid = makkahDayBounds(dateISO).start.getTime();
  const rows = await db.displaySchedule.findMany({ where: { screenId, active: true }, orderBy: { ordinal: "asc" } });
  const keyById = await programKeys(rows, db);
  const lines: { at: number; text: string }[] = [];
  for (const r of rows) {
    const w = resolveWindow(toScheduleDef(r), dateISO, prayerMs, mid);
    if (!w) continue;
    const sHH = hhmmMakkah(new Date(w.startMs));
    const eHH = hhmmMakkah(new Date(w.endMs));
    const content = contentLabel(r, keyById);
    if (r.startMode === DisplayScheduleStart.PRAYER && r.prayer) {
      const pHH = hhmmMakkah(prayers[r.prayer as Prayer]);
      lines.push({ at: w.startMs, text: `${PRAYER_AR[r.prayer as Prayer]} ${pHH} ← ${sHH}–${eHH}: ${content}` });
    } else {
      lines.push({ at: w.startMs, text: `${sHH}–${eHH}: ${content}` });
    }
  }
  return lines.sort((a, b) => a.at - b.at).map((l) => l.text);
}

function addDaysISO(dateISO: string, k: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

/** تحذيرات التداخل (§١٠) على مدى الأيّام السبعة القادمة — الأعلى ترتيباً يغلب. */
export async function scheduleWarnings(screenId: string, db: PrismaClient = prisma, now: Date = new Date()): Promise<string[]> {
  const rows = await db.displaySchedule.findMany({ where: { screenId, active: true }, orderBy: { ordinal: "asc" } });
  if (rows.length < 2) return [];
  const keyById = await programKeys(rows, db);
  const labelOf = (r: DisplaySchedule) => contentLabel(r, keyById);
  const seen = new Set<string>();
  const warnings: string[] = [];
  const base = makkahDayDate(now);
  const adjust = await screenPrayerAdjust(screenId, db);
  for (let k = 0; k < 7; k++) {
    const dateISO = addDaysISO(base, k);
    const prayerMs = madinahPrayerMs(dateISO, adjust);
    const mid = makkahDayBounds(dateISO).start.getTime();
    const wins = rows
      .map((r) => ({ r, w: resolveWindow(toScheduleDef(r), dateISO, prayerMs, mid) }))
      .filter((x): x is { r: DisplaySchedule; w: NonNullable<typeof x.w> } => x.w !== null);
    for (let i = 0; i < wins.length; i++) {
      for (let j = i + 1; j < wins.length; j++) {
        const a = wins[i], b = wins[j];
        if (!intervalsOverlap(a.w.startMs, a.w.endMs, b.w.startMs, b.w.endMs)) continue;
        const hi = a.r.ordinal <= b.r.ordinal ? a.r : b.r; // الأعلى (ordinal أصغر)
        const lo = a.r.ordinal <= b.r.ordinal ? b.r : a.r;
        const key = `${hi.id}:${lo.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push(`تداخلٌ: «${labelOf(lo)}» يغلبه «${labelOf(hi)}» (الأعلى ترتيباً).`);
      }
    }
  }
  return warnings;
}
